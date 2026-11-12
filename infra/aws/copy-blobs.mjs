import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { list } from "@vercel/blob";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const [envFile, bucket, scope] = process.argv.slice(2);
const account = "907264907058";
if (!envFile || !/^weekend-menu-storage-[a-z0-9]+$/.test(bucket ?? ""))
  throw new Error("Supply the restricted Vercel env file and the Weekend Menu bucket.");
if (scope && scope !== "menu") throw new Error("Unknown Blob copy scope.");
const token = parseEnv(readFileSync(envFile, "utf8")).BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("Vercel Blob credentials are missing.");
const s3 = new S3Client({ region: "us-east-1" });
const assets = /^menu-(?:(?:lg|md|sm)\.(?:jpg|webp)|weekend\.(?:jpg|pdf))$/;
const backups = /^loyalty-backups\/\d{4}-\d\d-\d\d\/[a-f0-9-]+\.enc$/;

function destination(path) {
  if (path === "menu.json") return "menu/menu.json";
  if (path === "customers.json") return "legacy-private/customers.json";
  if (assets.test(path)) return "legacy-public/" + path;
  if (backups.test(path)) return path;
  throw new Error("Found an unexpected Blob key. Review it before copying.");
}

const digest = (value) => createHash("sha256").update(value).digest("base64");
async function read(key) {
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: bucket, Key: key, ExpectedBucketOwner: account,
    }));
    return await response.Body.transformToByteArray();
  } catch (error) {
    if (error.name !== "NoSuchKey") throw error;
    return null;
  }
}

let cursor, verified = 0, copied = 0;
do {
  const page = await list({ token, cursor, limit: 100, prefix: scope === "menu" ? "menu.json" : undefined });
  for (const blob of page.blobs) {
    if (scope === "menu" && blob.pathname !== "menu.json") continue;
    const key = destination(blob.pathname);
    const source = new URL(blob.url);
    if (source.protocol !== "https:" || !source.hostname.endsWith(".blob.vercel-storage.com"))
      throw new Error("Unexpected source for a Vercel Blob object.");
    source.searchParams.set("copy", Date.now().toString());
    const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Blob copy read failed with HTTP ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const checksum = digest(bytes);
    const existing = await read(key);
    if (existing && digest(existing) === checksum) {
      verified++;
      continue;
    }
    if (existing && backups.test(key)) throw new Error("A retained backup changed unexpectedly.");
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, ExpectedBucketOwner: account,
      Body: bytes,
      ChecksumSHA256: checksum,
      ContentType: response.headers.get("content-type") ?? "application/octet-stream",
      IfNoneMatch: backups.test(key) ? "*" : undefined,
    }));
    if (digest(await read(key)) !== checksum) throw new Error("S3 readback failed.");
    copied++;
    verified++;
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
if (scope === "menu" && verified !== 1) throw new Error("The production menu was not found.");
console.log(JSON.stringify({ copied, verified }));
