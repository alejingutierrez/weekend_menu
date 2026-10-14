// Synthetic signing material for isolated tests only; never usable by Apple.
import forge from "node-forge";
export function configureTestWallet() {
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
  Object.assign(process.env, {
    APPLE_PASS_TYPE_ID: "pass.fixture.weekend",
    APPLE_TEAM_ID: "TESTTEAM",
    APPLE_PASS_CERT: Buffer.from(
      forge.asn1.toDer(p12).getBytes(),
      "binary",
    ).toString("base64"),
    APPLE_PASS_CERT_PASSWORD: "fixture-password",
    APPLE_WWDR_CERT: Buffer.from(forge.pki.certificateToPem(cert)).toString(
      "base64",
    ),
  });
}
