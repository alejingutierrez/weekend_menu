import "server-only";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import {
  assertLoyaltyBranch,
  assertLoyaltyDatabase,
  assertRdsDatabase,
} from "./loyalty-config";

type Row = Record<string, unknown>;
type Execute = (statement: Statement) => Promise<Row[]>;

class Statement implements PromiseLike<Row[]> {
  readonly text: string;
  readonly values: unknown[];
  private readonly execute: Execute;

  constructor(text: string, values: unknown[], execute: Execute) {
    this.text = text;
    this.values = values;
    this.execute = execute;
  }

  then<T = Row[], R = never>(
    fulfilled?: ((rows: Row[]) => T | PromiseLike<T>) | null,
    rejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ) {
    return this.execute(this).then(fulfilled, rejected);
  }
}

function sqlClient(execute: Execute, transaction: (queries: Statement[]) => Promise<Row[][]>) {
  const query = (text: string, values: unknown[] = []) =>
    new Statement(text, values, execute);

  function sql(parts: TemplateStringsArray, ...values: unknown[]) {
    const text = parts.reduce((result, part, index) =>
      index === 0 ? part : result + "$" + index + part, "");
    return query(text, values);
  }

  return Object.assign(sql, { query, transaction });
}

function neonClient(url: string) {
  const client = neon(url);
  const query = (statement: Statement) => client.query(statement.text, statement.values);
  return sqlClient(
    async (statement) => await query(statement),
    async (statements) => await client.transaction(statements.map(query)),
  );
}

function rdsClient(url: URL) {
  const caPath = process.env.LOYALTY_RDS_CA_PATH;
  if (!caPath) throw new Error("RDS requires a PostgreSQL CA bundle.");
  // Connection-string SSL parameters would replace the explicit CA options.
  url.search = "";
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
    max: 8,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (error) => console.error("[loyalty] idle database connection", error.name));

  return sqlClient(
    async (statement) => (await pool.query(statement.text, statement.values)).rows,
    async (statements) => {
      const connection = await pool.connect();
      let discard = false;
      try {
        await connection.query("BEGIN");
        const results: Row[][] = [];
        for (const statement of statements) {
          results.push((await connection.query(statement.text, statement.values)).rows);
        }
        await connection.query("COMMIT");
        return results;
      } catch (error) {
        try {
          await connection.query("ROLLBACK");
        } catch {
          discard = true;
        }
        throw error;
      } finally {
        connection.release(discard);
      }
    },
  );
}

export const loyaltyEnvironment = process.env.WEEKEND_RUNTIME_ENV ?? process.env.VERCEL_ENV;
const rdsUrl = process.env.LOYALTY_RDS_URL;
const neonUrl = process.env.LOYALTY_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

function databaseClient() {
  if (rdsUrl) {
    return rdsClient(assertRdsDatabase(rdsUrl, loyaltyEnvironment, process.env.LOYALTY_RDS_HOST));
  }
  assertLoyaltyDatabase(neonUrl, loyaltyEnvironment);
  return neonUrl ? neonClient(neonUrl) : null;
}

const client = databaseClient();

export async function loyaltySql() {
  if (!client) throw new Error("The loyalty database is not configured.");
  if (rdsUrl) {
    const [identity] = await client`SELECT current_database() AS database, current_user AS role`;
    if (
      loyaltyEnvironment === "production" &&
      (identity?.database !== "weekend" || identity?.role !== "weekend_runtime")
    ) throw new Error("The RDS connection is not the production loyalty runtime.");
    if (loyaltyEnvironment !== "production" && identity?.database === "weekend")
      throw new Error("Non-production runtime cannot access the production loyalty database.");
    return client;
  }

  const [identity] = await client`
    SELECT current_setting('neon.branch_id', true) AS branch_id, current_user AS role
  `;
  const branch = String(identity?.branch_id ?? "");
  assertLoyaltyBranch(branch, loyaltyEnvironment);
  if (loyaltyEnvironment === "production" && identity?.role !== "weekend_runtime")
    throw new Error("Production requires the limited loyalty runtime role.");
  if (loyaltyEnvironment !== "production" && branch === "br-crimson-fire-ac3ov0rp")
    throw new Error("Non-production runtime cannot access the production loyalty database.");
  return client;
}
