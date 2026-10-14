/**
 * Signs a customer id for use in stamp URLs
 * (`/admin/stamp?c=<id>&t=<sig>`), so ids can't be forged or enumerated.
 *
 * Initially preserves the legacy SESSION_SECRET HMAC values in an immutable
 * server-side token store. Existing QR and Wallet tokens then survive future
 * administrator-session key changes. Tokens remain scoped to their serial.
 *
 * Note: stamping also requires an admin session (middleware guards
 * `/admin/*`). This signature is defense-in-depth against tampering and
 * id enumeration, not the primary access control.
 */

import {
  getCustomer,
  missingCardTokenSerials,
  saveCardTokens,
  storedCardToken,
} from "./loyalty-store";
const enc = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 16 chars",
    );
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

export async function preserveAllCardTokens(): Promise<void> {
  for (;;) {
    const serials = await missingCardTokenSerials();
    if (!serials.length) return;
    await saveCardTokens(
      await Promise.all(
        serials.map(async (serial) => ({
          serial,
          token: await hmac(`stamp:${serial}`),
        })),
      ),
    );
  }
}

let bootstrap: Promise<void> | undefined;
async function preserveExistingTokens(): Promise<void> {
  if (!bootstrap)
    bootstrap = (async () => {
      await preserveAllCardTokens();
    })().catch((e) => {
      bootstrap = undefined;
      throw e;
    });
  await bootstrap;
}

export async function signCustomerId(id: string): Promise<string> {
  await preserveExistingTokens();
  const existing = await storedCardToken(id);
  if (existing) return existing;
  const generated = await hmac(`stamp:${id}`);
  if (await getCustomer(id)) {
    await saveCardTokens([{ serial: id, token: generated }]);
    return (await storedCardToken(id)) ?? generated;
  }
  return generated;
}

export async function verifyCustomerToken(
  id: string,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = await signCustomerId(id);
  if (expected.length !== token.length) return false;
  let r = 0;
  for (let i = 0; i < expected.length; i++) {
    r |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return r === 0;
}
