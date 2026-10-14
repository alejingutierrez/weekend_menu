/**
 * Session token utilities. Uses Web Crypto (HMAC-SHA256) so the
 * same code runs in Edge middleware and Node server routes.
 *
 * Versioned sessions bind current configured credentials and expire absolutely.
 *
 * The token is stored in an HttpOnly cookie. On every protected
 * request, middleware verifies the signature and expiry.
 */

const SESSION_COOKIE = "weekend_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24;

export function configuredAdminHash(userId: string): string | null {
  if (userId === process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH)
    return process.env.ADMIN_PASSWORD_HASH;
  try {
    const list = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(process.env.ADMIN_USERS_B64 ?? ""), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
    if (!Array.isArray(list)) return null;
    const user = list.find(
      (a) => a && a.u === userId && typeof a.h === "string" && a.h.length > 0,
    );
    return user?.h ?? null;
  } catch {
    return null;
  }
}
async function credentialVersion(userId: string): Promise<string | null> {
  const hash = configuredAdminHash(userId);
  return hash
    ? sign(
        `credential:${userId}:${hash}:${process.env.ADMIN_SESSION_VERSION ?? "1"}`,
      )
    : null;
}

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
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  const version = await credentialVersion(userId);
  if (!version) throw new Error("Administrator is not configured");
  const issuedAt = Math.floor(Date.now() / 1000),
    expiry = issuedAt + SESSION_TTL_SECONDS;
  const payload = b64urlEncode(
    enc.encode(
      JSON.stringify({ u: userId, iat: issuedAt, exp: expiry, v: version }),
    ),
  );
  const message = `v2.${payload}`;
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
  if (!token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [format, payload, signature] = parts;
  if (
    format !== "v2" ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return null;
  const expected = await sign(`${format}.${payload}`);
  if (!constantTimeEqual(expected, signature)) return null;
  try {
    const data = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof data.u !== "string" ||
      data.u.length > 128 ||
      !Number.isSafeInteger(data.iat) ||
      !Number.isSafeInteger(data.exp) ||
      data.iat > now ||
      data.exp <= now ||
      data.exp - data.iat > SESSION_TTL_SECONDS ||
      data.exp <= data.iat
    )
      return null;
    const current = await credentialVersion(data.u);
    if (
      !current ||
      typeof data.v !== "string" ||
      !constantTimeEqual(data.v, current)
    )
      return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}
