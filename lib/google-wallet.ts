/**
 * Google Wallet loyalty integration.
 *
 * Flow: ensure a LoyaltyClass exists (once), upsert a LoyaltyObject per
 * customer (holds the stamp count as loyaltyPoints + the stamp QR as its
 * barcode), and hand back a signed "Save to Google Wallet" JWT link.
 * Updating points later is a PATCH to the object — Google pushes the
 * change to the device automatically.
 *
 * Requires: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_CLASS_ID, and a
 * base64-encoded service-account JSON in GOOGLE_WALLET_SERVICE_ACCOUNT.
 * See SETUP-WALLET.md.
 */

import "server-only";
import { createSign } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { STAMPS_PER_REWARD, type Customer } from "./loyalty-types";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID;
const CLASS_ID = process.env.GOOGLE_WALLET_CLASS_ID;

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const b64 = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function googleConfigured(): boolean {
  return Boolean(ISSUER_ID && CLASS_ID && serviceAccount());
}

function objectId(customerId: string): string {
  // Object ids must match [A-Za-z0-9._-]; UUIDs already do.
  return `${ISSUER_ID}.${customerId.replace(/[^A-Za-z0-9._-]/g, "")}`;
}

async function accessToken(): Promise<string> {
  const sa = serviceAccount();
  if (!sa) throw new Error("Google service account not configured");
  const auth = new GoogleAuth({
    credentials: { client_email: sa.client_email, private_key: sa.private_key },
    scopes: [SCOPE],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Could not obtain Google access token");
  return token;
}

async function ensureClass(token: string, baseUrl: string): Promise<void> {
  const res = await fetch(`${API}/loyaltyClass/${CLASS_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) return;
  if (res.status !== 404) {
    throw new Error(`loyaltyClass GET ${res.status}: ${await res.text()}`);
  }
  const logoUrl = process.env.GOOGLE_WALLET_LOGO_URL || `${baseUrl}/wallet-logo.png`;
  const body = {
    id: CLASS_ID,
    issuerName: "Weekend Burger",
    programName: "Weekend Club",
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: "#E94A4A",
    programLogo: {
      sourceUri: { uri: logoUrl },
      contentDescription: { defaultValue: { language: "es", value: "Weekend Club" } },
    },
  };
  const ins = await fetch(`${API}/loyaltyClass`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ins.ok) throw new Error(`loyaltyClass insert ${ins.status}: ${await ins.text()}`);
}

function objectBody(customer: Customer, stampUrl: string) {
  return {
    id: objectId(customer.id),
    classId: CLASS_ID,
    state: "ACTIVE",
    accountId: customer.code,
    accountName: customer.name,
    loyaltyPoints: {
      label: "Sellos",
      balance: { int: customer.stamps },
    },
    secondaryLoyaltyPoints: {
      label: "Premios",
      balance: { int: customer.rewardsAvailable },
    },
    barcode: { type: "QR_CODE", value: stampUrl, alternateText: customer.code },
    textModulesData: [
      {
        id: "meta",
        header: "Tu progreso",
        body: `${customer.stamps}/${STAMPS_PER_REWARD} · faltan ${
          STAMPS_PER_REWARD - customer.stamps
        } para tu próxima gratis`,
      },
    ],
  };
}

async function upsertObject(
  token: string,
  customer: Customer,
  stampUrl: string,
): Promise<void> {
  const id = objectId(customer.id);
  const body = objectBody(customer, stampUrl);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const get = await fetch(`${API}/loyaltyObject/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (get.ok) {
    const patch = await fetch(`${API}/loyaltyObject/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (!patch.ok) throw new Error(`loyaltyObject PATCH ${patch.status}: ${await patch.text()}`);
  } else if (get.status === 404) {
    const ins = await fetch(`${API}/loyaltyObject`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!ins.ok) throw new Error(`loyaltyObject insert ${ins.status}: ${await ins.text()}`);
  } else {
    throw new Error(`loyaltyObject GET ${get.status}: ${await get.text()}`);
  }
}

function saveJwt(customer: Customer): string {
  const sa = serviceAccount();
  if (!sa) throw new Error("Google service account not configured");
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: { loyaltyObjects: [{ id: objectId(customer.id) }] },
  };
  const signingInput = `${Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  )}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.private_key)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Ensures the class + object exist/updated and returns the
 * "Save to Google Wallet" URL for this customer.
 */
export async function googleSaveUrl(
  customer: Customer,
  stampUrl: string,
  baseUrl: string,
): Promise<string> {
  const token = await accessToken();
  await ensureClass(token, baseUrl);
  await upsertObject(token, customer, stampUrl);
  return `https://pay.google.com/gp/v/save/${saveJwt(customer)}`;
}

/** Pushes the current stamp count to an existing pass (best-effort). */
export async function googleSync(customer: Customer, stampUrl: string): Promise<void> {
  if (!googleConfigured()) return;
  const token = await accessToken();
  await upsertObject(token, customer, stampUrl);
}
