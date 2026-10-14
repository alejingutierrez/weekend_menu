# Weekend loyalty data and Wallet recovery

Production must use endpoint `ep-quiet-union-acj8tg2k` **and** branch
`br-crimson-fire-ac3ov0rp`. Runtime verifies both. Preview/local execution refuses
the production branch. Do not weaken these checks to repair a configuration error.

## Preserving current cards

- Customer IDs/codes, recovered aliases, completed balance operations and Wallet
  tokens are permanent. Customers are archived/restored, never deleted.
- A stamp/redemption and its durable operation result commit in one transaction.
  Retry an uncertain response with the same operation ID. Do not generate a new
  ID until the original operation's result is known.
- The same transaction queues a Wallet update. Delivery failure cannot undo the
  stamp. Jobs have leases, revision checks and bounded retries. A stale worker
  cannot erase a newer update. Cron retries every ten minutes; authenticated
  staff can retry from `/admin/loyalty/status`.
- Invalid Apple push tokens are retired reversibly. Explicit device unregister
  requests remove only that device's registration, never a customer's card.
- Public signup does not reveal an existing card from known contact information.
  Staff recover the same card using the authenticated loyalty panel, including
  archived cards and old codes; they can open its existing web/Wallet link.

## Apple configuration

Wallet pushes use the pass certificate/private key, an HTTPS/HTTP2 connection,
the configured pass type, and an empty JSON payload. The separate APNs `.p8`
settings are not used for Wallet. Validate the leaf certificate's UID/team,
validity dates and intermediate chain. Renew before expiry while retaining the
pass type ID, serial and authentication token.

Card tokens are initialized with the previous HMAC values and then stored
immutably for current and alias serials. This preserves already installed passes
and QR codes across future administrator-session key changes. Before any such
change, verify every current and alias serial has a token. Keep the old legacy
Blob decryption key separately if the old migration file is still needed.

Do not change `SESSION_SECRET` merely to test this behavior; the integration
suite proves it with synthetic credentials. Never log pass tokens, push tokens,
contact details or private certificate material.

## Backups

Neon snapshots run daily at 03:00 America/Bogota, retained for 30 days. `main` is
a protected branch. A manual pre-migration snapshot is also retained.

A second daily backup copies a consistent database snapshot to the existing
Vercel Blob store as AES-256-GCM encrypted, compressed bytes. The encryption key
is `LOYALTY_BACKUP_KEY`, independent of the administrator's session. This Blob
store is public, so plaintext must never be uploaded. The service downloads,
decrypts and hashes each uploaded file before recording it as verified. It
refuses an empty backup. The backup includes cards, aliases, registrations,
audit history, operation results and permanent card tokens.

Keep the recovery key in private local storage (`.private/weekend-loyalty-backup-key`,
mode 0600) and in the production secret configuration. Do not rotate or delete
the key while it is needed to decrypt retained backups. Protect this file along
with the rest of the owner's secure credential backups.

## Restoring safely

1. Capture a fresh backup of the live database and its complete-record digests.
2. Inspect a historical snapshot on an isolated branch. With Neon
   `restore_snapshot`, always specify **`finalize: false`**. Its default can move
   production computes and change the production mapping. Never finalize a
   validation restore. Verify default/production mapping and endpoint IDs after
   the operation; names alone do not identify a branch.
3. Compare identities, balances, aliases and Wallet registrations. Existing
   records and newer balances must be preserved. Contact/code collisions require
   individual review; never replace a live database wholesale to recover one card.
4. For encrypted Blob backups, decrypt and review offline in private storage:
   `node scripts/plan-loyalty-recovery.mjs historical.enc current.enc private-key-file private-plan.json`.
   This produces a read-only missing-card/conflict plan and performs no writes.
5. Apply only individually verified missing records through an additive,
   transactional migration. Preserve the original UUID, code, balances and
   timestamps; restore its verified aliases, device registrations and tokens
   together. Do not overwrite existing rows or regenerate identifiers.
6. Check the complete-record digests, public card, signed QR and authenticated
   Wallet update, then the device. A server response alone does not prove an
   installed iPhone received the update.

## Verification

`npm test` runs offline protocol, credential, backup and guard tests. `npm run
test:integration` exercises the actual backend and Apple routes against an
explicit isolated Neon branch. Supply `TEST_DATABASE_URL` and `TEST_BRANCH_ID`
securely; the runner refuses production and checks the actual Neon branch ID.
Fixtures have no real Apple signing credentials and never push to real devices.
After a build, `npm run test:built` starts the compiled Next server on loopback
against the same isolated branch, and checks card rendering, pass generation,
authenticated health/status and rejection without credentials. This catches
runtime/compiler differences that direct TypeScript integration tests cannot.

CI on every push/PR runs the offline suite, TypeScript and production compilation
with Node 24. Validate schema changes on an isolated branch before applying them
through the owning Neon connector. The recovery database test checks all
pre-existing customer records remain byte-for-byte equal.
CI also rejects new high/critical production dependency advisories; the single
tracked upstream forge verification issue and its dependent package are explicitly
bounded exceptions, not a blanket exclusion of future forge advisories.

Sources: [Apple pass update protocol](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Updating.html),
[Vercel secured cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Dependency security

Next is updated to 16.4.0, with corrected compatible transitive dependencies.
The pass generator uses Joi 17.13.8 via an override within the same major version.
The remaining npm alerts are for node-forge's RSA signature-verification advisory
and the dependent passkit-generator package. The application validates its pass
certificate chain using Node's native X509/OpenSSL verification; node-forge is
used for parsing trusted signing material and generating signatures, not for
validating customer-controlled signatures. No untrusted certificate upload is
accepted. Track the upstream fix; this is a bounded mitigation, not a claim that
every dependency advisory is closed.
