# Weekend Club: recovery and retention

Production and Neon were matched by the complete set of 57 customer codes on
2026-10-13 (America/Bogota). The current database had 61 Apple registrations.
An isolated historical snapshot contained the same 56 older customers plus
one customer registered today in production. No customer from that retained
historical state was missing in production.

Postgres statistics reported 14 prior customer deletes. These counters do not
identify the cards, the administrator, dates, or whether the deletions affected
test accounts. There was no customer change log and no saved snapshot schedule.
The point-in-time history window was one day. This evidence cannot establish
that all older deleted customers have been recovered.

The pre-Postgres Blob held four cards: two test cards and two prior cards whose
normalized email matched one existing customer. The two old IDs and codes can
be mapped to that customer's current card through `customer_aliases`, without
changing its current contact data, stamps, rewards, or main code. Keep real
customer identities, contacts, signed URLs and backup payloads out of Git.

## Prevention

- The panel archives cards reversibly and exposes a separate Archived list with
  Restore. Searching by code also searches archived cards and recovered codes.
- The database rejects DELETE, TRUNCATE, and changes to customer IDs/codes.
  These safeguards also protect against an older application deployment.
- Insert/update triggers retain the full before/after state in `loyalty_events`.
  Admin mutations record the verified session username in the same transaction.
- Server actions authenticate independently of middleware. Archived cards
  cannot earn stamps or redeem rewards until restored.
- Recovery preserves old QR identifiers and Apple Wallet serials. A recovered
  code cannot be allocated to a different customer.
- Migration uses POST, checks the Blob response and reports contact/code
  conflicts. Unexpected database errors are surfaced rather than discarded.
- Use the Neon daily snapshot schedule at 08:00 UTC (03:00 Bogota), retaining
  snapshots for 30 days. Confirm it with `get_snapshot_schedule` after applying.

## Applying the additive schema

The statements in `lib/loyalty-schema.ts` are the authoritative migration.
Apply the complete array as one transaction, first on a disposable branch,
then on the verified production branch before promoting the application build.
`ensureSchema()` applies the same statements for a newly initialized database.
Rerunning them preserves existing records and does not duplicate baseline events.

## Validation

`npm test`, `npm run typecheck`, `npm run build`.
Run `tests/loyalty-recovery.sql` only on a disposable branch after the migration:
it asserts archival/restoration, retained balances, audit attribution, blocked
deletion/truncation/identity changes, recovered ID/code lookup, code collision
protection, and reward rollover. Its fixture never belongs in production.

After promotion, verify the original customer count and balances, the two
recovered card routes and signed stamp routes, the archive controls, and the
snapshot schedule. Restore a verified missing card selectively from a snapshot
or event record; do not replace the live database with an older snapshot.
