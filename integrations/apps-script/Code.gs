var FORM_KEYS_ = [
  "case_id",
  "submitted_at",
  "locale",
  "service",
  "locked_price",
  "display_name",
  "email",
  "contacts",
  "age_and_guardian",
  "student_and_proof",
  "project_links",
  "purpose_and_date",
  "credit_and_portfolio",
  "options",
  "service_details",
  "terms",
];

var PARAGRAPH_KEYS_ = {
  contacts: true,
  age_and_guardian: true,
  student_and_proof: true,
  project_links: true,
  purpose_and_date: true,
  credit_and_portfolio: true,
  options: true,
  service_details: true,
  terms: true,
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var envelope = JSON.parse(e.postData.contents);
    verifyEnvelope_(envelope);

    var properties = PropertiesService.getScriptProperties();
    var ledgerKey = "case:" + envelope.caseId;
    var ledgerRaw = properties.getProperty(ledgerKey);
    var ledger = ledgerRaw ? JSON.parse(ledgerRaw) : null;
    if (ledger && ledger.state === "complete") {
      return json_({
        ok: true,
        data: {
          state: "complete",
          googleResponseId: ledger.googleResponseId,
          notified: true,
        },
      });
    }

    var payload = decodePayload_(envelope.payloadBase64Url);
    if (payload.caseId !== envelope.caseId) {
      throw new Error("case_id_mismatch");
    }

    if (!ledger || ledger.state === "created") {
      var responseId = submitForm_(envelope.caseId, payload);
      ledger = { state: "form_written", googleResponseId: responseId };
      properties.setProperty(ledgerKey, JSON.stringify(ledger));
    }

    try {
      sendAdminMail_(envelope.caseId, payload);
    } catch (mailError) {
      return json_({
        ok: false,
        error: { code: "mail_failed", message: "Notification is pending." },
      });
    }

    ledger.state = "complete";
    properties.setProperty(ledgerKey, JSON.stringify(ledger));
    return json_({
      ok: true,
      data: {
        state: "complete",
        googleResponseId: ledger.googleResponseId,
        notified: true,
      },
    });
  } catch (error) {
    return json_({
      ok: false,
      error: {
        code: publicErrorCode_(error),
        message: "Submission could not be completed.",
      },
    });
  } finally {
    lock.releaseLock();
  }
}

function verifyEnvelope_(envelope) {
  if (
    !envelope ||
    envelope.version !== "v1" ||
    !envelope.timestamp ||
    !envelope.nonce ||
    !envelope.caseId ||
    !envelope.payloadBase64Url ||
    !envelope.signatureBase64Url
  ) {
    throw new Error("invalid_envelope");
  }
  var requestTime = new Date(envelope.timestamp).getTime();
  if (!isFinite(requestTime) || Math.abs(Date.now() - requestTime) > 300000) {
    throw new Error("expired_request");
  }

  var secret = requiredProperty_("HMAC_SECRET");
  var canonical = [
    envelope.version,
    envelope.timestamp,
    envelope.nonce,
    envelope.caseId,
    envelope.payloadBase64Url,
  ].join("\n");
  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(canonical, secret),
  ).replace(/=+$/, "");
  var actual = String(envelope.signatureBase64Url);
  var mismatch = expected.length === actual.length ? 0 : 1;
  var length = Math.max(expected.length, actual.length);
  for (var index = 0; index < length; index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (actual.charCodeAt(index) || 0);
  }
  if (mismatch !== 0) throw new Error("invalid_signature");
}

function decodePayload_(payloadBase64Url) {
  return JSON.parse(
    Utilities.newBlob(
      Utilities.base64DecodeWebSafe(payloadBase64Url),
    ).getDataAsString("UTF-8"),
  );
}

function fieldValues_(caseId, payload) {
  var draft = payload.normalizedDraft || {};
  return {
    case_id: caseId,
    submitted_at: String(payload.submittedAt || ""),
    locale: String(payload.locale || ""),
    service: String(payload.serviceId || ""),
    locked_price: JSON.stringify(payload.lockedPrice || {}),
    display_name: String(draft.displayName || ""),
    email: String(draft.email || ""),
    contacts: JSON.stringify(draft.contacts || []),
    age_and_guardian: JSON.stringify({
      adultStatus: draft.adultStatus,
      guardianAuthorized: draft.guardianAuthorized,
    }),
    student_and_proof: JSON.stringify({
      requested: draft.studentRequested,
      proofUrl: draft.studentProofUrl,
    }),
    project_links: JSON.stringify(draft.projectLinks || []),
    purpose_and_date: JSON.stringify({
      usagePurpose: draft.usagePurpose,
      desiredDate: draft.desiredDate,
    }),
    credit_and_portfolio: JSON.stringify({
      creditAccountId: draft.creditAccountId,
      portfolioConsent: draft.portfolioConsent,
    }),
    options: JSON.stringify({
      rush: draft.rush,
      sourcePrep: draft.sourcePrep,
      consultation: draft.consultation,
    }),
    service_details: JSON.stringify(draft),
    terms: JSON.stringify(payload.terms || []),
  };
}

function submitForm_(caseId, payload) {
  var form = FormApp.openById(requiredProperty_("FORM_ID"));
  var itemMap;
  try {
    itemMap = JSON.parse(requiredProperty_("FORM_ITEM_MAP"));
  } catch (error) {
    throw new Error("form_map_invalid");
  }
  var values = fieldValues_(caseId, payload);
  var response = form.createResponse();
  FORM_KEYS_.forEach(function (key) {
    if (!itemMap[key]) throw new Error("form_map_invalid");
    var item = form.getItemById(Number(itemMap[key]));
    var adapter = PARAGRAPH_KEYS_[key]
      ? item.asParagraphTextItem()
      : item.asTextItem();
    response.withItemResponse(adapter.createResponse(String(values[key])));
  });
  return response.submit().getId();
}

function sendAdminMail_(caseId, payload) {
  var serviceId = String(payload.serviceId || "unknown");
  var completeJson = JSON.stringify(payload, null, 2);
  MailApp.sendEmail({
    to: requiredProperty_("ADMIN_EMAIL"),
    subject: "[Kamel Commission] " + caseId + " — " + serviceId,
    body: completeJson,
    htmlBody:
      "<h1>Kamel Commission</h1><p><strong>" +
      escapeHtml_(caseId) +
      "</strong></p><pre>" +
      escapeHtml_(completeJson) +
      "</pre>",
  });
}

function requiredProperty_(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error("configuration_missing");
  return value;
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publicErrorCode_(error) {
  var code = error && error.message ? String(error.message) : "relay_failed";
  var allowed = {
    expired_request: true,
    invalid_signature: true,
    invalid_envelope: true,
    case_id_mismatch: true,
    configuration_missing: true,
    form_map_invalid: true,
  };
  return allowed[code] ? code : "relay_failed";
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
