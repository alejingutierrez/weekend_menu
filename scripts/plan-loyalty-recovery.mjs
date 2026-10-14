// Offline, read-only recovery review. Inputs and outputs must stay in private storage.
import fs from "node:fs/promises";
import {
  decryptLoyaltyBackup,
  planMissingCardRecovery,
} from "../lib/loyalty-backup-format.ts";
const [historicalFile, currentFile, keyFile, outputFile] =
  process.argv.slice(2);
if (!historicalFile || !currentFile || !keyFile || !outputFile)
  throw new Error(
    "Usage: node scripts/plan-loyalty-recovery.mjs historical.enc current.enc private-key-file private-plan.json",
  );
const key = (await fs.readFile(keyFile, "utf8")).trim();
const history = decryptLoyaltyBackup(
  await fs.readFile(historicalFile, "utf8"),
  key,
);
const current = decryptLoyaltyBackup(
  await fs.readFile(currentFile, "utf8"),
  key,
);
const plan = planMissingCardRecovery(history, current);
await fs.writeFile(outputFile, JSON.stringify(plan, null, 2) + "\n", {
  mode: 0o600,
});
await fs.chmod(outputFile, 0o600);
console.log({
  missing: plan.missing.length,
  conflicts: plan.conflicts.length,
  currentRecordsPreserved: plan.existingPreserved,
  writesPerformed: 0,
});
