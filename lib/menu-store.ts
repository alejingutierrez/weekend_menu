/**
 * Menu storage. Uses Vercel Blob in any environment that has
 * `BLOB_READ_WRITE_TOKEN` set (production on Vercel, or local dev
 * if the token is pulled). Falls back to the bundled `data/menu.json`
 * when the token is missing OR when the blob is empty (first deploy).
 *
 * Reads are uncached so admin saves are visible on the public page
 * after `revalidatePath('/')`.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Menu } from "./menu-types";

const FILE_PATH = path.join(process.cwd(), "data", "menu.json");
const BLOB_KEY = "menu.json";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readFromBlob(): Promise<Menu | null> {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 5 });
    const match = blobs.find((b) => b.pathname === BLOB_KEY);
    if (!match) return null;
    // Cache-bust the long-lived Blob CDN cache so admin edits show up
    // immediately on the public page instead of serving a stale copy.
    const res = await fetch(`${match.url}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return normalizeMenu(await res.json());
  } catch {
    return null;
  }
}

/**
 * Backwards-compat: older blobs stored `icons` as a string array.
 * Coerce to a single string so the new `Burger.icons` shape holds
 * for both old and new data without a manual migration step.
 */
function normalizeMenu(raw: unknown): Menu {
  const m = raw as Menu & { burgers: Array<{ icons?: string | string[] }> };
  if (Array.isArray(m?.burgers)) {
    for (const b of m.burgers) {
      if (Array.isArray(b.icons)) {
        b.icons = b.icons.join("");
      }
    }
  }
  return m as Menu;
}

async function writeToBlob(menu: Menu): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BLOB_KEY, JSON.stringify(menu, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 0, // serve fresh menu right after an admin edit
  });
}

async function readFromFile(): Promise<Menu> {
  const raw = await fs.readFile(FILE_PATH, "utf-8");
  return normalizeMenu(JSON.parse(raw));
}

async function writeToFile(menu: Menu): Promise<void> {
  const serialized = JSON.stringify(menu, null, 2) + "\n";
  await fs.writeFile(FILE_PATH, serialized, "utf-8");
}

export async function readMenu(): Promise<Menu> {
  if (BLOB_TOKEN) {
    const fromBlob = await readFromBlob();
    if (fromBlob) return fromBlob;
    // Fall through: blob not yet seeded, use bundled JSON.
  }
  return readFromFile();
}

export async function writeMenu(menu: Menu): Promise<void> {
  if (BLOB_TOKEN) {
    await writeToBlob(menu);
    return;
  }
  await writeToFile(menu);
}
