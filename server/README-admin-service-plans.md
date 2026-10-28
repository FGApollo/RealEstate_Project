# Admin service plans

The Admin **Gói dịch vụ & Giá bán** screen and Agent pricing cards use the same PostgreSQL catalog. The price entered by an Admin is the total VND amount for the selected 1–12 month term, not a monthly price multiplied in React. Free trial remains one calendar month per account. Enterprise is consultation-only; no unverified contact email is invented.

## Deployment

1. Back up the database using the normal Supabase backup process. Apply `db-migration/017-admin-service-plans.sql` in the Supabase SQL Editor after migration 014. It preserves the current Premium amount, duration and selling status. Re-running 017 preserves settings and audit rows.
2. Deploy backend and frontend together. The new backend catalog requires 017 and fails with an actionable service-unavailable response if it is missing. New payment requests include `planVersion`; old clients must reload before creating new orders. Existing orders and webhook settlement continue using their original immutable snapshots.
3. Open Admin → **Gói dịch vụ & Giá bán**. Confirm the current configured price before changing anything. Verify the saved configuration in the Agent preview. All test screenshots and fixture prices come from an isolated database and are never imported into production.

No new secret or browser environment variable is required. Keep the Supabase service key on the backend. No database password or key should be pasted in chat.

## Consistency and payment rules

- Premium is the existing `agent_billing_plans` row (`PAID`); there is no second editable source of truth for its price.
- Admin changes require an active verified Admin, an expected version, a UUID request identifier and a reason. The transaction locks the plan, updates the version and appends its audit event. A stale edit returns 409; repeating the same request returns the result without another audit event. Reusing a request identifier with different input is rejected.
- A plan can have only one pending schedule. Cancel it before creating a replacement. The UI accepts Vietnam local date/time and sends an explicit offset/UTC timestamp. The DB validates the effective time again.
- Scheduled changes are applied at the next catalog read or new-order reservation after the DB effective time. This needs no process-local timer or cron. The stored schedule always controls which configuration a new order can use. Applying the schedule and reading its version are transactional and idempotent.
- Pausing Premium stops new orders; a previously created pending order can still be completed. Existing paid entitlements are never shortened by price/status/term changes.
- Checkout requires the version that the Agent confirmed. A changed price causes a 409 and reloads the catalog. If an earlier pending order exists at another price/term, the Agent sees that order's details before continuing to payOS.
- Trial and consultation cards are catalog records. Their configuration is read-only in this release; the free-trial entitlement rules are enforced by the existing SQL function. `agent_service_packages.contact_url` is null until a verified business contact is configured by a database administrator; the UI does not show a fabricated contact address.

## Security and performance

- `/api/admin/service-plans`, `/history`, and `POST /paid` are behind the existing live-session Admin guard and read/write rate limits. The actor identity comes from the session, never from the submitted body. Request fields and number/date bounds are allowlisted.
- SQL repeats Admin authorization. New tables enable RLS; browser roles have neither table access nor RPC execute privileges. Backend direct writes to the price/audit/schedule tables are revoked, routing mutations through the audited functions. Internal helpers cannot be invoked by browser roles or the backend role directly.
- SQL functions use a fixed search path, explicit qualified objects and an 8-second timeout. The catalog is a single bounded query. Schedule lookup has a partial due-date index; a row lock is taken only when a schedule is due or an Admin writes. History uses indexed database pagination, at most 50 rows per request.
- The UI is lazy-loaded from the shared Admin shell. Requests abort on unmount; there is no polling loop or frontend aggregation of user/payment lists. No price is cached across an authorization boundary; API responses are `no-store`.

## API

- `GET /api/admin/service-plans`: catalog, current versions, DB snapshot time and pending schedules.
- `GET /api/admin/service-plans/history?page=1&limit=10`: audit rows and total count, without replay payloads.
- `POST /api/admin/service-plans/paid`: `action`, `requestId`, `expectedVersion`, `reason`; `SAVE` also requires `amount`, `durationMonths`, `active` and optional `effectiveAt`. `CANCEL` omits configuration fields.
- `GET /api/payments/catalog`: same saved catalog, plus existing payOS availability.
- `POST /api/payments`: existing `planCode`, `requestId`, plus required integer `planVersion`.

## Verification

`tests/servicePlans.test.js` executes production SQL on isolated PostgreSQL: migration repeatability, current prices, scheduled activation, cancellation, stale versions, replay protection, permission denial, immutable pending orders, settlement after price/pause changes, audit pagination and real authenticated HTTP routes. No production rows are changed.

`tests/servicePlans.browser.cjs` runs the real Admin/Agent components against that isolated backend. It verifies save confirmation, persisted prices, cancellation, stale-edit recovery, history, accessible dialogs, desktop/tablet/mobile layout and the Agent's confirmed amount. `tests/payments.browser.cjs` verifies the existing official-SDK signed payment/webhook/renewal/revenue path with isolated provider fixtures.
