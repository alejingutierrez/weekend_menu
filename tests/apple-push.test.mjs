import { test, mock } from "node:test";
import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import http2 from "node:http2";
import forge from "node-forge";
import {
  appleSigningMaterial,
  appleCertificateStatus,
} from "../lib/apple-wallet.ts";
import { sendPassUpdates } from "../lib/apns.ts";

function fixtureCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048),
    cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 90 * 86400000);
  const attrs = [
    { name: "commonName", value: "Isolated fixture" },
    { shortName: "OU", value: "TESTTEAM" },
    { type: "0.9.2342.19200300.100.1.1", value: "pass.fixture.weekend" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    cert,
    "fixture-password",
  );
  process.env.APPLE_PASS_TYPE_ID = "pass.fixture.weekend";
  process.env.APPLE_TEAM_ID = "TESTTEAM";
  process.env.APPLE_PASS_CERT = Buffer.from(
    forge.asn1.toDer(p12).getBytes(),
    "binary",
  ).toString("base64");
  process.env.APPLE_PASS_CERT_PASSWORD = "fixture-password";
  process.env.APPLE_WWDR_CERT = Buffer.from(
    forge.pki.certificateToPem(cert),
  ).toString("base64");
}

test("Wallet pushes use the pass certificate, bounded requests, empty payload and per-token results", async () => {
  fixtureCertificate();
  assert.equal(appleCertificateStatus().valid, true);
  process.env.APPLE_TEAM_ID = "WRONG";
  assert.throws(() => appleSigningMaterial());
  process.env.APPLE_TEAM_ID = "TESTTEAM";
  let connectedOptions, headers, payload;
  mock.method(http2, "connect", (_host, options) => {
    connectedOptions = options;
    const client = new EventEmitter();
    client.setTimeout = () => {};
    client.destroy = () => {};
    client.request = (h) => {
      headers = h;
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.setEncoding = () => {};
      req.close = () => req.emit("close");
      req.end = (body) => {
        payload = body;
        queueMicrotask(() => {
          req.emit("response", { ":status": 410 });
          req.emit("data", '{"reason":"Unregistered"}');
          req.emit("end");
          req.emit("close");
        });
      };
      return req;
    };
    return client;
  });
  try {
    const results = await sendPassUpdates(["a".repeat(64), "a".repeat(64)]);
    assert.ok(connectedOptions.cert.includes("BEGIN CERTIFICATE"));
    assert.ok(connectedOptions.key.includes("PRIVATE KEY"));
    assert.equal(headers["apns-topic"], "pass.fixture.weekend");
    assert.equal(headers.authorization, undefined);
    assert.equal(payload, "{}");
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 410);
    assert.equal(results[0].reason, "Unregistered");
  } finally {
    mock.restoreAll();
  }
});
