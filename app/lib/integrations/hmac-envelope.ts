export interface SignedEnvelope {
  version: "v1";
  timestamp: string;
  nonce: string;
  caseId: string;
  payloadBase64Url: string;
  signatureBase64Url: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function canonical(
  envelope: Omit<SignedEnvelope, "signatureBase64Url">,
): string {
  return [
    envelope.version,
    envelope.timestamp,
    envelope.nonce,
    envelope.caseId,
    envelope.payloadBase64Url,
  ].join("\n");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSignedEnvelope(input: {
  caseId: string;
  payload: unknown;
  secret: string;
  now: string;
  nonce: string;
}): Promise<SignedEnvelope> {
  const payloadBase64Url = toBase64Url(
    new TextEncoder().encode(JSON.stringify(input.payload)),
  );
  const unsigned = {
    version: "v1" as const,
    timestamp: input.now,
    nonce: input.nonce,
    caseId: input.caseId,
    payloadBase64Url,
  };
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(input.secret),
    new TextEncoder().encode(canonical(unsigned)),
  );
  return {
    ...unsigned,
    signatureBase64Url: toBase64Url(new Uint8Array(signature)),
  };
}

export async function verifySignedEnvelopeForTest(
  envelope: SignedEnvelope,
  secret: string,
): Promise<unknown> {
  let signature: Uint8Array;
  try {
    signature = fromBase64Url(envelope.signatureBase64Url);
  } catch {
    throw new Error("invalid_signature");
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importHmacKey(secret),
    signature.buffer as ArrayBuffer,
    new TextEncoder().encode(
      canonical({
        version: envelope.version,
        timestamp: envelope.timestamp,
        nonce: envelope.nonce,
        caseId: envelope.caseId,
        payloadBase64Url: envelope.payloadBase64Url,
      }),
    ),
  );
  if (!valid) throw new Error("invalid_signature");
  try {
    return JSON.parse(
      new TextDecoder().decode(fromBase64Url(envelope.payloadBase64Url)),
    );
  } catch {
    throw new Error("invalid_payload");
  }
}
