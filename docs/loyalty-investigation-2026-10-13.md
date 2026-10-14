# Investigation of reported missing cards, excluding Alejandro

This is a continuation of the recovery investigation. The two recovered legacy
codes belonged to Alejandro and do not resolve the other reported cases.

## Evidence

- All 56 current cards belonging to other customers returned HTTP 200 and their
  expected code on the public card page (2026-10-13, America/Bogota).
- Short customer codes and signed stamp QR tokens have no expiration field or
  TTL in the current code. The administrator session has a separate expiry.
- The production signing configuration metadata has not changed since May 6,
  before the loyalty program launched. Preview has a separate configuration.
  Signing values were not retrieved or compared in this investigation.
- The retained historical database state includes all 56 older customers that
  remain in production, plus today's new registration in the live database.
- Postgres counters report 14 prior delete operations. Counters cannot identify
  the affected people or establish that every operation deleted a real customer.
- Blob contains one old customer file with four records (two Alejandro cards
  and two tests). No additional customer backups or exports were found there.
- No runtime error clusters were returned for the relevant routes in the
  accessible seven-day query. Missing-card UI states do not necessarily throw
  errors, so this does not rule out failed scans.
- Historical implementation notes from July 3 describe cards disappearing
  across certain CLI releases before Git production deployment was established.
  This is an investigative lead, not proof of who was affected. Current
  production is the Git deployment on the permanent Neon main branch.
- Reading physical deleted-row remnants on an isolated historical copy was
  attempted with pageinspect; the existing Neon role refused extension creation.
  No production extension or role/permission change was made.

## Additional prevention

Production now verifies the known permanent Neon endpoint before issuing or
reading cards. It cannot silently switch to a temporary database. Production
QRs default to the stable public domain instead of an individual deployment URL.

Authenticated staff scan failures are recorded in loyalty_events as SCAN_FAILED,
with the card reference, administrator, time and reason (invalid signature,
missing customer, or archived card). Signed tokens and contact details are not
stored in these diagnostic events. The staff UI distinguishes these states.

Use Git deployments for production. Apply no wholesale restore or invented
replacement cards to explain unidentified reports. Additional historical panel
reads require normal application authentication; extraction of the signing
secret was rejected by automatic approval review and was not performed.
