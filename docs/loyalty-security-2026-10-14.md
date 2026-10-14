# Weekend: security and deletion investigation, October 14

## What can be established about the 14 entries

No additional lost real customer has been identified. The retained historical
state contains all 56 older customers still in production; production has one
newer customer. Public verification previously found all 56 other cards
accessible. This comparison does not cover data that disappeared before the
earliest retained state, October 12 at 06:45:44 UTC.

`pg_stat_user_tables.n_tup_del = 14` measures attempted tuple deletion activity,
including aborted transactions. It is not a list of 14 people, 14 statements,
dates, actors or committed deletions. PostgreSQL's implementation explicitly
keeps attempted tuple activity on abort. The counter therefore cannot be
attributed to tests, Alejandro or real customers without further evidence.

Reviewed evidence includes retained Neon branches/snapshots, the old encrypted
Blob customer file, local exports, Git history, historical releases, current
device references, provider logs and Neon SQL Editor history. The old Blob file
contains two Alejandro cards and two tests; it yields no additional lost real
customer. Historical deployment panels read today's database and are not old
customer snapshots. No orphan device serials remain in current data.

Neon SQL Editor history and saved queries are empty. Query telemetry returns
`telemetry_not_enabled` in this region. PostgreSQL statement logging is disabled;
physical-page/WAL inspection extensions and file access are unavailable to the
existing role. Vercel rejects queries outside its one-day runtime retention.
The accessible 23-hour errors belong to a previously repaired deployment; no
customer-deletion identities were found. There are no external log drains.

Old code physically deleted customers and registrations and older implementation
notes mention ephemeral deployment databases. Both are plausible causes; neither
identifies who was affected by the 14 attempts. Provider-only retained storage or
an older external export may yield more evidence. No wholesale restore or
replacement customer was used to fill this evidence gap.

Sources: [PostgreSQL 17 statistics implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/activity/pgstat_relation.c),
[PostgreSQL statistics](https://www.postgresql.org/docs/17/monitoring-stats.html).

## Additional protection

- The application queries Neon as `weekend_runtime`, a separate role without
  membership in `neon_superuser`, customer DELETE/TRUNCATE, schema CREATE or
  ownership of protected tables. Owner migrations install the schema first;
  production requests never apply schema DDL. Provider-managed owner connection
  variables still exist in Vercel; the application selects the separate restricted
  connection and rejects an owner-role production query. This is not complete
  removal of owner credentials from the deployment environment.
- Administrator sessions expire absolutely after 24 hours and are checked
  against the currently configured administrator/password/version. Removing a
  user, changing their password or advancing `ADMIN_SESSION_VERSION` revokes
  sessions on deployments with the new configuration. Existing 180-day cookies
  require a fresh login. Wallet and QR tokens retain their existing values.
- Login, signup and Apple registration use atomic database quotas shared across
  instances, before expensive/password or persistent-write work. Bucket keys
  contain HMACs, not raw IPs or contacts. Vercel's trusted IP header is used only
  inside Vercel. Quotas also include shared global/account/card boundaries.
- Cards allow ten active Apple device registrations and twenty retained device
  rows, counting canonical and legacy serials together. Existing active devices
  can refresh their registration. Concurrent requests lock the canonical customer
  before checking capacity; existing registrations are preserved.
- Apple JSON bodies are bounded by actual streamed bytes. APNs sends at most
  eight concurrent requests per delivery batch. After twelve failed attempts a
  Wallet job remains visible and paused; staff can resume it after fixing the
  cause. Customer balances do not depend on push delivery.
- Staff search runs against all customers, with fifty-row pages and whole-database
  summary totals. Token initialization uses batches of one hundred. Existing
  customer data is never removed to make pages or backups smaller.
- Menu writes independently require an administrator. Public Google Wallet errors
  return a generic recovery message. Staff status flags backups older than 36
  hours and paused Wallet work. Recovery-plan files use private permissions.
- Neon point-in-time history is now seven days, increased from one day; this
  grows future history and cannot recreate expired history. Daily 03:00 Bogota
  snapshots retain thirty days. Independent encrypted Blob backups preserve
  customer identities, balances, history, aliases, registrations and tokens.

Sources: [Neon role privileges](https://github.com/neondatabase/website/blob/main/content/docs/manage/roles.md),
[Vercel trusted request headers](https://vercel.com/docs/headers/request-headers),
[Neon recovery history](https://github.com/neondatabase/website/blob/main/content/docs/postgres/backup-restore/history-window.md).

## Validation and limits

The baseline Codex Security scan at `cdc42b5` reports four medium-severity
findings: non-revocable sessions, unrestricted login attempts, unlimited Wallet
device fan-out and unrestricted signup accumulation. This change adds controls
at those boundaries. No observed exploit or historical deletion identity is
claimed. The baseline report has a bounded transport-validation gap for the
menu action; the compiled test confirms anonymous requests leave the menu intact,
and the action itself now checks authentication.

Validation: 22 offline tests; 15 isolated Neon integration tests; restricted-role
permission, schema, write, archive/restore and backup-read checks; compiled Next
card/pass/search/status/authentication checks; TypeScript and production build.
Concurrent tests cover idempotent stamps, redemption, shared quotas and device
capacity. Real production customers are not test fixtures.

Before the owner migration, snapshot `snap-restless-leaf-aclsplek` was captured
with expiry November 14. Production remained at 57 customers, 137 lifetime stamps,
61 registrations, 59 permanent tokens and 19 protection triggers. Full-record
digests remained `44ad697b50cf3142f13a82b251f09a32` (customers) and
`a838ba2cfdac2ae1a9bcac3f11982dc1` (original registration fields).

The Apple certificate expires August 2, 2027 at 14:37:15 UTC. A synthetic APNs
probe verified server authentication/connection; physical iPhone installation
and receipt of an update still require device evidence. Google Wallet credentials
are not configured, so its existing web fallback remains the supported path.
The known upstream node-forge verification advisory remains tracked and bounded
by native X509 validation; it is not represented as fixed.
