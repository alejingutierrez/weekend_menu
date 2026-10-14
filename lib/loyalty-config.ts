// Public infrastructure identifiers, not credentials.
export const PRODUCTION_LOYALTY_ORIGIN = "https://weekend-menu.vercel.app";
const PRODUCTION_DATABASE_ENDPOINT = "ep-quiet-union-acj8tg2k";

/** A production release must never issue cards on a temporary database. */
export function assertLoyaltyDatabase(url: string | undefined, vercelEnv?: string): void {
  if (vercelEnv !== "production") return;
  if (!url) throw new Error("Production loyalty database is missing.");
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("Production loyalty database URL is invalid.");
  }
  const endpoint = host.split(".")[0].replace(/-pooler$/, "");
  if (endpoint !== PRODUCTION_DATABASE_ENDPOINT || !host.endsWith(".neon.tech")) {
    throw new Error("Production loyalty database does not match the permanent database.");
  }
}
