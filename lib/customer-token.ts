/**
 * Signs a customer id for use in stamp URLs
 * (`/admin/stamp?c=<id>&t=<sig>`), so ids can't be forged or enumerated.
 *
 * Uses the same SESSION_SECRET as the admin session, with a
 * domain-separation prefix. HMAC-SHA256 via Web Crypto (mirrors
 * `lib/auth.ts`, works in both Node and Edge).
 *
 * Note: stamping also requires an admin session (middleware guards
 * `/admin/*`). This signature is defense-in-depth against tampering and
 * id enumeration, not the primary access control.
 */

const enc = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set to a string of at least 16 chars");
  }
  return secret;
}

function b64url(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return b64url(sig);
}

export async function signCustomerId(id: string): Promise<string> {
  return hmac(`stamp:${id}`);
}

export async function verifyCustomerToken(
  id: string,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const expected = await signCustomerId(id);
  if (expected.length !== token.length) return false;
  let r = 0;
  for (let i = 0; i < expected.length; i++) {
    r |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return r === 0;
}
