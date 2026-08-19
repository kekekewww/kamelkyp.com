export function createCspNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
