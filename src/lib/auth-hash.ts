// Shared by both the Node API route and the Edge middleware, so both compute
// the exact same hash from the same DASHBOARD_PASSWORD env var.
export async function sha256Hex(input: string, subtle: SubtleCrypto): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const AUTH_COOKIE_NAME = "pod_dash_auth";
