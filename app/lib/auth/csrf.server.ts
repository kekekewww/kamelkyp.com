import { z } from "zod";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

const CsrfPayloadSchema = z.object({
  nonce: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

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

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function canonical(payload: string, subject: string): string {
  return `${payload}\n${subject}`;
}

export async function createCsrfToken(input: {
  subject: string;
  secret: string;
  now: Date;
  nonce?: Uint8Array;
}): Promise<string> {
  const nonce = input.nonce ?? crypto.getRandomValues(new Uint8Array(18));
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        nonce: toBase64Url(nonce),
        expiresAt: input.now.getTime() + TOKEN_LIFETIME_MS,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(input.secret),
    encoder.encode(canonical(payload, input.subject)),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyCsrfToken(input: {
  token: string;
  subject: string;
  secret: string;
  origin: string | null;
  expectedOrigin: string;
  now: Date;
}): Promise<void> {
  try {
    if (!input.origin || input.origin !== input.expectedOrigin) {
      throw new Error("origin_mismatch");
    }
    const [payload, encodedSignature, extra] = input.token.split(".");
    if (!payload || !encodedSignature || extra) throw new Error("token_shape");
    const signature = fromBase64Url(encodedSignature);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(input.secret),
      signature.buffer as ArrayBuffer,
      encoder.encode(canonical(payload, input.subject)),
    );
    if (!valid) throw new Error("signature_invalid");
    const parsed = CsrfPayloadSchema.parse(
      JSON.parse(decoder.decode(fromBase64Url(payload))),
    );
    if (input.now.getTime() > parsed.expiresAt)
      throw new Error("token_expired");
  } catch {
    throw new Error("csrf_invalid");
  }
}
