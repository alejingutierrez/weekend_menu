# Loyalty continuity and maintenance

Administrator sessions now check current credentials and expire absolutely.
Login, enrollment and device registration apply shared request limits. Customer
search uses bounded pages, and Wallet delivery uses bounded concurrent requests
and visible retry recovery. Menu updates check authentication within the action.

Apply owner migrations before publishing code that requires them. Keep runtime
permissions separate from migration permissions, preserve permanent card tokens,
and validate existing records before and after a release. Follow the recovery
runbook for encrypted backup validation and additive restoration.

Validation covers offline tests, isolated backend concurrency, restricted runtime
permissions, compiled routes, TypeScript and production compilation. Physical
Apple device receipt remains a separate acceptance check. The known upstream
certificate-verification dependency advisory remains tracked and mitigated by
native verification.

The customer-loss investigation is retained locally with its detailed evidence.
A database tuple-deletion counter alone cannot identify lost customers or prove
committed deletions; unavailable historical logs cannot establish that no loss
occurred.
