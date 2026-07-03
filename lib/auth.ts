/**
 * Session token utilities. Uses Web Crypto (HMAC-SHA256) so the
 * same code runs in Edge middleware and Node server routes.
 *
 * Token format: `<userId>.<expiryUnixSeconds>.<base64UrlSignature>`
 *
 * The token is stored in an HttpOnly cookie. On every protected
 * request, middleware verifies the signature and expiry.
 */

const SESSION_COOKIE = "weekend_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days (refreshed on each visit)

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET env var must be set to a string of at least 16 chars",
    );
  }
  return secret;
}

const enc = new TextEncoder();

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of b) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(message: string): Promise<string> {
  const key = await importKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncode(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const sessionCookieName = SESSION_COOKIE;

export type SessionCookieOptions = {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export async function createSessionCookie(
  userId: string,
): Promise<SessionCookieOptions> {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const message = `${userId}.${expiry}`;
  const signature = await sign(message);
  return {
    name: SESSION_COOKIE,
    value: `${message}.${signature}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearedSessionCookie(): SessionCookieOptions {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<{ userId: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiryStr, signature] = parts;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) {
    return null;
  }
  const expected = await sign(`${userId}.${expiry}`);
  if (!constantTimeEqual(expected, signature)) return null;
  return { userId };
}
