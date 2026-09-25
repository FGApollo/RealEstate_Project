# Rate limiting and anti-abuse

Rate limits are centralized in `middleware/rateLimiters.js` and applied by
`index.js` and route middleware. The API-wide IP limiter runs after CORS but
before JSON parsing. Login keys combine the client IP with a normalized email;
authenticated writes and messages use `req.user.id`, not request-body identity.

The ordinary limiters use the package's in-process memory store. This is suitable
for local development and a single backend instance, but counters reset on
restart and are not shared between instances. Use a shared store before scaling
the Render service to multiple instances.

## Production proxy

`TRUST_PROXY_HOPS=1` should be set on the Render backend when requests pass
through one trusted Render proxy hop. Local development uses `0`. Confirm the
actual route/proxy topology before changing this value; do not use `true` or
trust client-supplied `X-Forwarded-For` values without a trusted proxy.

## Live SMS quota setup

Live eSMS delivery is protected by a shared, atomic Supabase quota keyed by an
HMAC of the normalized phone number using the backend `JWT_SECRET`. Apply
`db-migration/005-otp-send-rate-limit.sql` in the Supabase SQL editor before
enabling billable eSMS delivery. The endpoint fails closed if the RPC is missing.
Listing images are limited to six per listing and 5 MB per image; avatar upload
accepts one file, and KYC accepts one front/back pair with the existing 5 MB
per-file cap.

Before setting `ESMS_SANDBOX=0`, set both values in the backend environment from
the product's SMS policy and the eSMS account budget:

- `OTP_SEND_MAX_PER_PHONE_PER_HOUR`
- `OTP_SEND_MAX_PER_PHONE_PER_DAY`
- `OTP_SEND_MAX_GLOBAL_PER_DAY`

The public eSMS documentation does not define a universal per-recipient hourly
or daily quota; these thresholds must follow the account/product policy. The
global daily cap is the backend's explicit cost ceiling. SMS quota reservations
are counted even when the provider request later fails, to avoid retry storms
that could create charges.

## 429 responses and logs

Rate-limited responses return HTTP 429, a generic error message, a policy code,
`Retry-After`, and standard `RateLimit` headers. Limit logs include policy,
method, route, authenticated user ID when available, and client IP. They never
include passwords, OTPs, access/refresh tokens, email, phone, or limiter keys.

The current frontend displays the server's OTP error and uses `Retry-After` to
keep its resend countdown aligned with the backend. That countdown is UX only;
the server-side limit is authoritative.
