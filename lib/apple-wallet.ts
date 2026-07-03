/**
 * Apple Wallet (.pkpass) generation for the loyalty store card.
 *
 * Builds a signed storeCard pass: the Weekend wordmark as the logo text, the
 * stamps rendered as the mascot hand on the strip image, the stamp QR as
 * the barcode, and (when APNs is configured) a webServiceURL +
 * authenticationToken so the pass updates live on the device.
 *
 * Certificates come from env as base64 (see SETUP-WALLET.md):
 *  - APPLE_PASS_CERT / APPLE_PASS_CERT_PASSWORD  → the Pass Type ID .p12
 *  - APPLE_WWDR_CERT                             → Apple WWDR intermediate (PEM)
 *
 * Placeholder icon images are generated as solid brand-color PNGs; drop
 * real art in `assets/pass/` (icon.png, icon@2x.png) to override.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { PKPass } from "passkit-generator";
import { STAMPS_PER_REWARD, type Customer } from "./loyalty-types";
import { signCustomerId, verifyCustomerToken } from "./customer-token";
import { canvas, encodePng, fillCircle, solidPng, type RGB } from "./png";
import { MASCOT_VIEWBOX, mascotPaths, svgToPng } from "./mascot";

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
const TEAM_ID = process.env.APPLE_TEAM_ID;
const BRAND_RED: [number, number, number] = [233, 74, 74];

export function appleConfigured(): boolean {
  return Boolean(
    PASS_TYPE_ID &&
      TEAM_ID &&
      process.env.APPLE_PASS_CERT &&
      process.env.APPLE_WWDR_CERT,
  );
}

export function apnsConfigured(): boolean {
  return Boolean(
    appleConfigured() && process.env.APPLE_APNS_KEY && process.env.APPLE_APNS_KEY_ID,
  );
}

/** The per-pass authentication token Apple sends back on web-service calls. */
export async function passAuthToken(customerId: string): Promise<string> {
  return signCustomerId(customerId);
}

/** Verifies an `Authorization: ApplePass <token>` header for a serial. */
export async function verifyApplePassAuth(
  authHeader: string | null,
  serial: string,
): Promise<boolean> {
  if (!authHeader) return false;
  const m = /^ApplePass\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return false;
  return verifyCustomerToken(serial, m[1]);
}

/** Extracts leaf certificate + private key (PEM) from a .p12 buffer. */
function certsFromP12(p12Der: Buffer, password: string): { cert: string; key: string } {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Der.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const keyBags = {
    ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
    ...p12.getBags({ bagType: forge.pki.oids.keyBag }),
  };
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    keyBags[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error("No private key found in APPLE_PASS_CERT (.p12)");

  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ]?.[0];
  if (!certBag?.cert) throw new Error("No certificate found in APPLE_PASS_CERT (.p12)");

  return {
    key: forge.pki.privateKeyToPem(keyBag.key),
    cert: forge.pki.certificateToPem(certBag.cert),
  };
}

async function passImage(name: string, w: number, h: number): Promise<Buffer> {
  try {
    return await fs.readFile(path.join(process.cwd(), "assets", "pass", name));
  } catch {
    return solidPng(w, h, BRAND_RED);
  }
}

const CREAM_RGB: RGB = [242, 238, 224];
const WHITE_RGB: RGB = [255, 255, 255];
const CREAM_CSS = "rgb(242,238,224)";

/**
 * Renders the stamp progress as an SVG "strip": each earned stamp is the
 * mascot hand (cream, sized to fill its cell), each pending one a light
 * ring — so the Wallet pass reads like a stamp card with the mascot as the
 * stamp itself. Laid out as a 5-column grid on the brand-red background.
 */
function stampStripSvg(filled: number, total: number): string {
  // Apple aspect-fills the storeCard strip into a ~375×144 area and crops
  // overflow, so match that height and keep generous margins.
  const W = 375;
  const H = 144;
  const cols = 5;
  const rows = Math.max(1, Math.ceil(total / cols));
  const marginX = 34;
  const marginY = 26;
  const cellW = (W - marginX * 2) / cols;
  const cellH = (H - marginY * 2) / rows;
  const rad = Math.min(cellW, cellH) / 2 - 5;
  // "Manito suelta": hand ~1.1× the empty-slot diameter, no disc behind it.
  const handScale = (rad * 2.2) / MASCOT_VIEWBOX.h;
  const hx = MASCOT_VIEWBOX.x + MASCOT_VIEWBOX.w / 2;
  const hy = MASCOT_VIEWBOX.y + MASCOT_VIEWBOX.h / 2;
  const hand = mascotPaths(CREAM_CSS);
  let body = `<rect width="${W}" height="${H}" fill="rgb(233,74,74)"/>`;
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = marginX + cellW * (col + 0.5);
    const cy = marginY + cellH * (row + 0.5);
    if (i < filled) {
      body += `<g transform="translate(${cx},${cy}) scale(${handScale}) translate(${-hx},${-hy})">${hand}</g>`;
    } else {
      body += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="rgb(255,255,255)" stroke-opacity="0.5" stroke-width="3"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

/** Strip renderer (SVG→PNG) with a dot-based fallback if resvg ever fails. */
function renderStrip(filled: number, total: number, widthPx: number): Buffer {
  try {
    return svgToPng(stampStripSvg(filled, total), widthPx);
  } catch (e) {
    console.error("[apple-wallet] strip render failed, using fallback:", e);
    return stampStripFallbackPng(filled, total, widthPx >= 700 ? 2 : 1);
  }
}

/** Fallback strip: plain cream dots (filled) / rings (pending), no mascot. */
function stampStripFallbackPng(filled: number, total: number, scale: number): Buffer {
  const W = 375 * scale;
  const H = 144 * scale;
  const cols = 5;
  const rows = Math.max(1, Math.ceil(total / cols));
  const marginX = 34 * scale;
  const marginY = 26 * scale;
  const cellW = (W - marginX * 2) / cols;
  const cellH = (H - marginY * 2) / rows;
  const rad = Math.min(cellW, cellH) / 2 - 5 * scale;
  const ring = 3 * scale;
  const c = canvas(W, H, BRAND_RED);
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = marginX + cellW * (col + 0.5);
    const cy = marginY + cellH * (row + 0.5);
    if (i < filled) {
      fillCircle(c, cx, cy, rad, CREAM_RGB);
    } else {
      fillCircle(c, cx, cy, rad, WHITE_RGB);
      fillCircle(c, cx, cy, rad - ring, BRAND_RED);
    }
  }
  return encodePng(c);
}

function passJson(customer: Customer, stampUrl: string, webService?: {
  url: string;
  token: string;
}) {
  const remaining = Math.max(0, STAMPS_PER_REWARD - customer.stamps);
  const json: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    organizationName: "Weekend Burger",
    description: "Weekend Club",
    serialNumber: customer.id,
    // The Weekend wordmark stays at the top; the mascot now lives in the
    // stamps, so it's dropped from up here (no logo image) to avoid redundancy.
    logoText: "weekend",
    foregroundColor: "rgb(255,255,255)",
    backgroundColor: "rgb(233,74,74)",
    labelColor: "rgb(255,214,214)",
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: stampUrl,
        messageEncoding: "iso-8859-1",
        altText: customer.code,
      },
    ],
    storeCard: {
      // The strip shows the stamps; keep the fields light around it. The top
      // is the Weekend wordmark, so the member name goes here.
      secondaryFields: [
        { key: "name", label: "SOCIO", value: customer.name },
        { key: "reward", label: "GRATIS", value: String(customer.rewardsAvailable) },
      ],
      auxiliaryFields: [
        { key: "code", label: "CÓDIGO", value: customer.code },
        { key: "left", label: "FALTAN", value: remaining === 0 ? "¡Listo!" : String(remaining) },
      ],
      backFields: [
        {
          key: "info",
          label: "Cómo funciona",
          value: `Junta ${STAMPS_PER_REWARD} sellos y llévate una hamburguesa gratis. Muestra el código de esta tarjeta en caja para que te sellen.`,
        },
      ],
    },
  };
  if (webService) {
    json.webServiceURL = webService.url;
    json.authenticationToken = webService.token;
  }
  return json;
}

/** Builds and signs the .pkpass for a customer. */
export async function buildPkpass(
  customer: Customer,
  stampUrl: string,
  baseUrl: string,
): Promise<Buffer> {
  if (!appleConfigured()) throw new Error("Apple Wallet not configured");

  const p12 = Buffer.from(process.env.APPLE_PASS_CERT as string, "base64");
  const password = process.env.APPLE_PASS_CERT_PASSWORD ?? "";
  const { cert, key } = certsFromP12(p12, password);
  const wwdr = Buffer.from(process.env.APPLE_WWDR_CERT as string, "base64").toString(
    "utf8",
  );

  const webService = apnsConfigured()
    ? { url: `${baseUrl}/api/wallet/apple`, token: await passAuthToken(customer.id) }
    : undefined;

  const [icon, icon2x] = await Promise.all([
    passImage("icon.png", 29, 29),
    passImage("icon@2x.png", 58, 58),
  ]);
  // The mascot now lives in the stamps (strip), not as a top logo, so the
  // pass header shows only the member name (logoText). renderStrip falls
  // back to plain dots if resvg ever fails, so it can't break generation.
  const strip = renderStrip(customer.stamps, STAMPS_PER_REWARD, 375);
  const strip2x = renderStrip(customer.stamps, STAMPS_PER_REWARD, 750);

  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson(customer, stampUrl, webService))),
      "icon.png": icon,
      "icon@2x.png": icon2x,
      "strip.png": strip,
      "strip@2x.png": strip2x,
    },
    {
      wwdr,
      signerCert: cert,
      signerKey: key,
    },
  );

  return pass.getAsBuffer();
}
