/**
 * Menu storage. Reads from and writes to `data/menu.json`.
 *
 * NOTE: Vercel's serverless filesystem is ephemeral / read-only,
 * so writes only persist on a long-running server (local dev or
 * a self-hosted deployment). For Vercel production, swap the
 * `writeMenu` impl for Vercel Blob / KV / Postgres before going
 * live with the admin.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Menu } from "./menu-types";

const FILE_PATH = path.join(process.cwd(), "data", "menu.json");

export async function readMenu(): Promise<Menu> {
  const raw = await fs.readFile(FILE_PATH, "utf-8");
  return JSON.parse(raw) as Menu;
}

export async function writeMenu(menu: Menu): Promise<void> {
  const serialized = JSON.stringify(menu, null, 2) + "\n";
  await fs.writeFile(FILE_PATH, serialized, "utf-8");
}
