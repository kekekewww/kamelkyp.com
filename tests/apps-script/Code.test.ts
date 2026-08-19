import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fakeHmac(message: string, secret: string): number[] {
  const input = new TextEncoder().encode(`${secret}\n${message}`);
  const output = new Uint8Array(32);
  input.forEach((byte, index) => {
    output[index % output.length] ^= byte;
  });
  return [...output];
}

const formKeys = [
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

async function createHarness() {
  const source = await readFile("integrations/apps-script/Code.gs", "utf8");
  const secret = "test-secret-with-at-least-32-characters";
  const store = new Map<string, string>([
    ["FORM_ID", "test-form"],
    ["ADMIN_EMAIL", "admin@example.com"],
    ["HMAC_SECRET", secret],
    [
      "FORM_ITEM_MAP",
      JSON.stringify(Object.fromEntries(formKeys.map((key, index) => [key, index + 1]))),
    ],
  ]);
  const formSubmit = vi.fn(() => ({ getId: () => "google-response-1" }));
  const mailSend = vi.fn();
  const item = {
    asTextItem: () => ({ createResponse: (value: string) => ({ value }) }),
    asParagraphTextItem: () => ({
      createResponse: (value: string) => ({ value }),
    }),
  };
  const response = {
    withItemResponse: vi.fn(() => response),
    submit: formSubmit,
  };
  const Utilities = {
    computeHmacSha256Signature: fakeHmac,
    base64EncodeWebSafe: (bytes: number[]) => base64Url(Uint8Array.from(bytes)),
    base64DecodeWebSafe: (value: string) => {
      const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
      const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
      return [...decoded].map((character) => character.charCodeAt(0));
    },
    newBlob: (bytes: number[]) => ({
      getDataAsString: () => new TextDecoder().decode(Uint8Array.from(bytes)),
    }),
  };
  const services = {
    Utilities,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => store.get(key) ?? null,
        setProperty: (key: string, value: string) => store.set(key, value),
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: vi.fn(), releaseLock: vi.fn() }),
    },
    FormApp: {
      openById: () => ({
        getItemById: () => item,
        createResponse: () => response,
      }),
    },
    MailApp: { sendEmail: mailSend },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content: string) => ({
        setMimeType() {
          return this;
        },
        getContent: () => content,
      }),
    },
  };
  const runtime = new Function(
    ...Object.keys(services),
    `${source}\nreturn { doPost: doPost };`,
  )(...Object.values(services)) as {
    doPost(event: { postData: { contents: string } }): { getContent(): string };
  };

  function signedEvent(
    payload: Record<string, unknown>,
    timestamp = "2026-08-10T12:00:00.000Z",
  ) {
    const caseId = String(payload.caseId);
    const payloadBase64Url = base64Url(
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    const unsigned = {
      version: "v1",
      timestamp,
      nonce: "f5dc165c-6f50-40d5-aee3-cc03128cbf58",
      caseId,
      payloadBase64Url,
    };
    const canonical = Object.values(unsigned).join("\n");
    return {
      ...unsigned,
      signatureBase64Url: base64Url(
        Uint8Array.from(fakeHmac(canonical, secret)),
      ),
    };
  }

  function invoke(envelope: Record<string, unknown>) {
    return JSON.parse(
      runtime.doPost({ postData: { contents: JSON.stringify(envelope) } }).getContent(),
    );
  }

  return { invoke, signedEvent, formSubmit, mailSend };
}

const payload = {
  caseId: "KAM-20260810-01HZX8J4AB",
  submittedAt: "2026-08-10T12:00:00.000Z",
  locale: "en",
  serviceId: "full_mix",
  lockedPrice: { minor: 8000, currency: "TWD" },
  normalizedDraft: { displayName: "Artist K", email: "artist@example.com" },
  terms: ["common-en-v1"],
};

describe("Apps Script Google Form and Gmail relay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:01:00.000Z"));
  });

  it("writes one Form response and one email for duplicate complete requests", async () => {
    const harness = await createHarness();
    const event = harness.signedEvent(payload);
    expect(harness.invoke(event).ok).toBe(true);
    expect(harness.invoke(event).ok).toBe(true);
    expect(harness.formSubmit).toHaveBeenCalledTimes(1);
    expect(harness.mailSend).toHaveBeenCalledTimes(1);
    expect(harness.mailSend.mock.calls[0]?.[0]).toMatchObject({
      to: "admin@example.com",
    });
  });

  it("retries only Gmail after Form submission succeeds", async () => {
    const harness = await createHarness();
    harness.mailSend.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    const event = harness.signedEvent(payload);
    expect(harness.invoke(event).error.code).toBe("mail_failed");
    expect(harness.invoke(event).ok).toBe(true);
    expect(harness.formSubmit).toHaveBeenCalledTimes(1);
    expect(harness.mailSend).toHaveBeenCalledTimes(2);
  });

  it("rejects expired timestamps and changed payloads", async () => {
    const harness = await createHarness();
    const expired = harness.signedEvent(payload, "2026-08-10T11:00:00.000Z");
    expect(harness.invoke(expired).error.code).toBe("expired_request");
    const tampered = harness.signedEvent(payload);
    tampered.payloadBase64Url += "A";
    expect(harness.invoke(tampered).error.code).toBe("invalid_signature");
    expect(harness.formSubmit).not.toHaveBeenCalled();
    expect(harness.mailSend).not.toHaveBeenCalled();
  });
});
