# Authentication, authorization and identity audit

Scope: the 47 HTTP routes mounted by `server/index.js`, their controllers and services, the Supabase queries they invoke, and frontend login/API call sites. **The inventory below is the pre-fix snapshot, written before implementation; it is not a description of the patched code.** This is a source audit, not a production penetration test. Database RLS policies and production environment variables are not present in this repository, so their behavior cannot be asserted here.

## Current trust boundary and login flow

`POST /api/login` reads an email/password from the body; `authController.login` calls `authService.loginUser`, which selects `users` by email and compares the password with bcrypt. `POST /api/google-login` verifies a Google ID token or calls Google userinfo for an access token, then looks up or creates a `users` row by email. Both return `{ message, user }`; neither issues an application session or access token. `POST /api/register` accepts `role` from the body and `authService.registerUser` inserts it directly, including `ADMIN` if the database accepts it.

The React login pages save the returned user object under `localStorage.user`. Later requests use ordinary `fetch` calls and send IDs in body/query; there is no application Bearer token or cookie. Logout removes `localStorage.user`. There is no server logout, session expiration or revocation. The Google credential used during login is **not** an application access token for subsequent API calls.

`server/index.js` mounts routes without authentication middleware. `server/config/supabase.js` uses a shared server-side Supabase client, selecting `SUPABASE_SERVICE_ROLE_KEY` if present, otherwise a publishable key. Effective database RLS behavior cannot be determined from source alone. A service role key, if configured, bypasses RLS, making Express authorization essential.

Client-controlled body, query, params, `localStorage` and React state are untrusted. A database lookup confirming `users.id = 1` has role `ADMIN` confirms a property of that row, **not** that the caller is user 1. The current code conflates these statements in `adminKycService.ensureAdmin`, property ownership comparisons, and similar checks.

## Endpoint inventory

Notation: `C` = controller; `S` = service; `DB` = relevant database operation. `No` means no request authentication. `Existence/role only` means a database row or role is checked for a caller-supplied ID, but the caller is not bound to it. Route parameters representing target resources remain valid inputs after authentication, subject to authorization. Public catalog reads can remain public subject to data minimization.

| Method and endpoint | Controller → service → DB | Client identifier and role in decision | Current verification and impact |
|---|---|---|---|
| POST `/api/register` | `authController.register` → `authService.registerUser` → `users` select by email, insert | Body `email`, `role` | Email uniqueness only; caller chooses role, including `ADMIN`; privilege escalation. |
| POST `/api/login` | `authController.login` → `authService.loginUser` → `users` select by email | Body email/password | Password verified with bcrypt, but no persistent application identity issued. |
| POST `/api/google-login` | `authController.googleLogin` → `authService.googleLogin` → Google verify/userinfo, `users` select/insert by email | Body Google credential | Google credential checked for login; no app session issued. |
| GET `/api/user/:id` | `authController.getUserById` → `authService.getUserById` → `users` select | Param target ID | No; reveals email/phone of arbitrary user. |
| GET `/api/properties` | `propertyController.getProperties` → `propertyService.getProperties` → `properties` joined to owner and child tables | None | Public catalog read; `select *` may expose more than intended. |
| POST `/api/properties/check-before-save` | `propertyController.checkBeforeSave` → `propertyService.checkSimilarity`, `geminiService.checkDescriptionIsMultiListing` → `properties` select, external Gemini | Body `owner_id` used to classify own/other matches; `excludeId` query target | No; arbitrary ID, data disclosure and costly service use. |
| POST `/api/properties` | `propertyController.createProperty` → `propertyService.createProperty` → `users` role lookup, `properties`/child tables insert, Storage | Body `owner_id` treated as creator | Existence/role only; can create a listing as any existing AGENT. |
| GET `/api/properties/:id/similar` | `propertyController.getSimilarProperties` → `propertyService.getSimilarProperties` → `property_links`, `properties` | Param property target ID | No; public catalog read. |
| GET `/api/properties/:id` | `propertyController.getPropertyById` → `propertyService.getPropertyById` → `properties` select | Param property target ID | No; public catalog read. |
| PUT `/api/properties/:id` | `propertyController.updateProperty` → `propertyService.updateProperty` → `properties` owner lookup/update, `users` role lookup, child tables/Storage | Param target ID; body `owner_id` claimed actor | Existence/role/owner-row comparison only; any caller can claim real owner ID. `...fields` also permits unintended column updates. |
| DELETE `/api/properties/:id` | `propertyController.deleteProperty` → `propertyService.deleteProperty` → `properties` owner lookup/delete, child tables/Storage | Param target ID; query `userId` claimed actor | Owner-row comparison only; any caller can submit owner ID. |
| GET `/api/properties/:id/reviews` | `propertyController.getPropertyReviews` → `reviewService.getPropertyReviews` → `property_reviews` | Param property target ID | No; approved reviews are public. |
| POST `/api/properties/:id/reviews` | `propertyController.createPropertyReview` → `reviewService.createPropertyReview` → reviews insert, property aggregate update | Param property target ID; body `userId` author and `isVerifiedReview` | No; author impersonation and forged verified-review flag. |
| GET `/api/favorites` | `favoritesController.getFavorites` → `favoritesService.getFavorites` → `favorites`, `properties` | Query `userId` claimed actor | No; arbitrary user's saved list readable. |
| POST `/api/favorites` | `favoritesController.addFavorite` → `favoritesService.addFavorite` → `favorites` select/insert | Body `userId` claimed actor, `propertyId` target | No; mutate another user's favorites. |
| POST `/api/favorites/delete` | `favoritesController.removeFavorite` → `favoritesService.removeFavorite` → `favorites` delete | Body `userId` claimed actor, `propertyId` target | No; mutate another user's favorites. |
| GET `/api/agent/overview` | `agentController.getOverview` → `agentService.getOverview` → `users`, `properties`, `favorites` | Query `userId` claimed agent | No; profile email/phone and dashboard data of arbitrary ID. |
| GET `/api/agent/reviews` | `agentController.getAgentReviews` → `agentService.getAgentReviews` → `properties`, `property_reviews` | Query `userId` claimed agent | No; agent scope is client-selected. |
| GET `/api/kyc/status` | `kycController.getKycStatus` → `kycService.getKycStatus` → `users`, `identity_verifications` | Query `userId` claimed actor | Existence only; other user's KYC state/details readable. |
| POST `/api/kyc/upload-card` | `kycController.uploadCard` → `kycService.uploadCard` → `users`, Storage, `identity_verifications` | Body `userId` claimed actor, name/phone as submitted data | Existence/status only; can submit KYC for another user. |
| POST `/api/kyc/upload-selfie` | `kycController.uploadSelfie` → `kycService.uploadSelfie` → `users`, `identity_verifications`, Storage, trust score | Body `userId` claimed actor | Existence/status and face comparison only; caller identity unverified. |
| GET `/api/admin/kyc/rejected` | `adminKycController.getRejectedVerifications` → `adminKycService.getRejectedVerifications` → `users` role, `identity_verifications`/`users` | Query `adminId` claimed admin | Existence/role only; any caller may claim an existing admin ID. |
| GET `/api/admin/kyc/:verificationId` | `adminKycController.getVerificationDetail` → `adminKycService.getVerificationDetail` → `users` role, `identity_verifications`/`users` | Query `adminId` claimed admin; param target verification | Existence/role only; sensitive KYC disclosure. |
| POST `/api/admin/kyc/:verificationId/approve` | `adminKycController.approveVerification` → `adminKycService.approveVerification` → KYC/user/trust-score updates | Body `adminId` claimed admin; param target verification | Existence/role only; unauthorized approval and trust bonus possible. |
| POST `/api/admin/kyc/:verificationId/reject` | `adminKycController.rejectVerification` → `adminKycService.rejectVerification` → KYC/user updates | Body `adminId` claimed admin; param target verification | Existence/role only; unauthorized rejection possible. |
| GET `/api/chat/messages` | `chatController.getMessages` → `chatService.getMessages` → `messages` select | Query `userId` claimed participant, `otherId` target peer | No; arbitrary conversation readable. |
| POST `/api/chat/messages` | `chatController.sendMessage` → `chatService.sendMessage` → `messages` insert | Body `senderId` claimed actor, `receiverId` target | No; send as another user. |
| GET `/api/chat/conversations` | `chatController.getConversations` → `chatService.getConversations` → `messages`, `users`, `agent_user_funnel` | Query `userId` claimed actor | No; inbox, partner email/phone and funnel data readable. |
| POST `/api/chat/funnel` | `chatController.updateFunnelStage` → `chatService.updateFunnelStage` → `agent_user_funnel` upsert | Body `agentId` claimed actor, `userId` target | No; alter any agent's funnel. |
| GET `/api/chat/funnel/stats` | `chatController.getFunnelStats` → `chatService.getFunnelStats` → `agent_user_funnel` select | Query `agentId` claimed actor | No; arbitrary agent stats. |
| POST `/api/phone/send-otp` | `phoneOtpController.sendOtp` → `phoneOtpService.sendOtp` → `users`, `phone_otps` | Body `userId` claimed actor, phone candidate | Existence/format/cooldown only; OTP created for arbitrary user. |
| POST `/api/phone/verify-otp` | `phoneOtpController.verifyOtp` → `phoneOtpService.verifyOtp` → `phone_otps`, `users`, trust score | Body `userId` claimed actor, phone/OTP proof | OTP possession verified, but no caller-to-user binding; phone/trust score mutation. |
| GET `/api/admin/reviews` | `adminController.getAllReviews` → direct Supabase `property_reviews` join | None | No admin check; all reviews readable. |
| POST `/api/admin/reviews/:reviewId/status` | `adminController.updateReviewStatus` → direct Supabase reviews/property update | Param review target, body status | Status allowlist only; unauthorized moderation. |
| POST `/api/reports` | `reportController.createReport` → `reportService.createReport` → `properties` lookup, `property_reports` insert | Body `reporterId` claimed actor, `propertyId` target | Property existence/self-report comparison only; reporter can be spoofed. |
| GET `/api/reports/admin` | `reportController.getAdminReports` → `reportService.getAdminReports` → `property_reports`, `properties` | Query status filter | No admin check; all reports readable. |
| POST `/api/reports/admin/:reportId/resolve` | `reportController.resolveReport` → `reportService.resolveReport` → `trustScoreService.applyReportPenalty` → reports/properties/users/trust logs | Body `adminId` claimed actor; param report target | Nonempty ID only; unauthorized report resolution and score penalty. |
| POST `/api/reports/admin/:reportId/reject` | `reportController.rejectReport` → `reportService.rejectReport` → `property_reports` update | Body `adminId` claimed actor; param report target | Nonempty ID only; unauthorized rejection. |
| POST `/api/trust-score/profile-completed/check` | `trustScoreController.checkProfileCompleted` → `trustScoreService.applyProfileCompletenessBonus` → `users`, `trust_score_logs` | Body `userId` claimed actor | Profile state checked, not caller identity; can trigger other user's bonus. |
| POST `/api/trust-score/30-days-clean/check` | `trustScoreController.checkThirtyDaysClean` → `trustScoreService.applyThirtyDaysNoViolationBonus` → `users`, `properties`, reports, trust logs | Body `userId` claimed actor | Age/violation checked, not caller identity; can trigger other user's bonus. |
| POST `/api/users/avatar` | `userProfileController.uploadAvatar` → `userProfileService.uploadAvatar` → `users`, Storage, trust score | Body `userId` claimed actor | Existence only; replace another user's avatar. |
| GET `/api/subscriptions` | `subscriptionController.getSubscription` → `subscriptionService.getSubscription` → `seller_subscriptions` | Query `userId` claimed actor | No; another user's subscription readable. |
| POST `/api/subscriptions` | `subscriptionController.createOrUpdateSubscription` → `subscriptionService.createOrUpdateSubscription` → `seller_subscriptions` insert/update | Body `userId` claimed actor; plan/price/status/months supplied by client | No; alter another user's subscription and self-select ACTIVE/price. |

The four legacy `/api/admin/kyc/*` definitions in `adminRoutes.js` are mounted **after** `adminKycRoutes.js` under the same URL. The earlier router currently handles matching requests. The legacy handlers nevertheless contain weaker direct Supabase paths and must be removed/consolidated or protected before any route-order change.

## Attack cases and root cause

| Case | Source-based conclusion |
|---|---|
| A, body `adminId: 1` | If user 1 exists with role `ADMIN`, the active KYC service accepts that ID as authority. Reports need only a nonempty ID. The request is not bound to user 1. |
| B, `owner_id` of user B | Create/update can pass if B is an AGENT and owns the target; delete can pass if `userId` equals target owner. No proof caller is B. Public reads are accessible by design, but scoped agent/KYC/chat reads are not. |
| C, no login | Routes have no authentication middleware. Their service/DB preconditions may still fail; a successful DB mutation depends on supplied IDs, constraints, RLS and data state. |
| D, bypass UI | `AdminRoute` protects only React rendering. Direct API calls do not pass through it. |
| E, `role: ADMIN` | Registration copies body role to `users` insert. Database constraints are unknown; code does not reject it. |

The primary defects are authentication bypass, vertical privilege escalation via registration/admin IDs, horizontal IDOR, unauthorized data access and mutation. A frontend route guard has no security effect on direct API requests.

## Proposed architecture and source of truth

The `users` table is the source of truth for account identity and current role. A verified, server-issued access token establishes the caller's user ID; middleware loads the current user row and sets `req.user = { id, role, ...minimal profile }`. Role/permission policies run after authentication. The database record's `owner_id`/`user_id` is the source of truth for resource ownership. Client IDs in route params identify targets, never actors. Public endpoints are explicitly designated and return limited fields.

Use a short-lived application JWT access token sent as `Authorization: Bearer`. Payload: `sub` (string user ID), `iss`, `aud`, `iat`, `exp`, `jti`, and token type; no email, role, password or sensitive data. Sign with a dedicated environment-managed strong key and a fixed allowed algorithm; validate signature, algorithm, issuer, audience, type, expiration and subject, then look up `users` for current role. Wrong/missing/expired token returns 401; valid identity lacking permission returns 403. Keep the access token in memory in the browser. For reload persistence use a rotating opaque refresh token in a `Secure`, `HttpOnly`, `SameSite` cookie backed by hashed server-side session records. Logout revokes that record and clears the cookie; stolen access tokens remain usable until short expiry unless a denylist or session binding is added. CORS and cookie policy must match the actual frontend/API domains.

Middleware responsibilities: `authenticate` verifies the Bearer token and loads current identity; `requireRole` checks role; resource policy checks target ownership/participation after loading it. Controllers derive actor ID from `req.user.id`, parse target IDs from params and validated input, then call services. No service should infer the caller from body/query fields.

| Field | Current role | Migration rule |
|---|---|---|
| `adminId`, `reporterId`, `senderId`, `agentId` when acting as sender/agent/admin | Claimed actor | Derive from `req.user.id`. |
| `userId` in favorites, own KYC, agent overview, subscription, avatar, trust bonus, own chat inbox | Claimed actor | Derive from `req.user.id`; drop client requirement after frontend migration. |
| `owner_id` in listing create/update and similarity self/other classification | Claimed actor | Derive from `req.user.id`; compare DB owner to authenticated ID. |
| `:verificationId`, `:reportId`, `:reviewId`, `:propertyId`/`:id`, chat `otherId`, report `propertyId`, favorite `propertyId` | Resource target | Keep, validate shape, authorize against role or ownership/participation. |
| `:id` on user profile lookup | Resource target | Keep only if need identified profile; return public-safe fields or require self/admin. |
| `role` on registration | Requested account type | Allow explicit public `USER`/`AGENT` only; never allow self-registration as `ADMIN`. |
| `status`, `priceVnd` on subscription | Claimed business state | Derive from server-side plan/payment result; client cannot activate paid entitlement. |

## Compatibility and implementation order

Blast radius: password/Google login and registration responses; every protected backend router; `authService`, controller/service signatures and Supabase queries; React login/register/logout and all API call sites; `/`, `/swipe`, `/chat`, `/sale/overview`, `/admin` guards; backend `JWT_SECRET`/issuer/audience and refresh-cookie/CORS configuration; new session-table migration; existing users' re-login; tests and deployment order. The current `server/.env` contains a publishable Supabase key but no visible service-role key; moving to mandatory server credentials requires deployment configuration. Existing browser `localStorage.user` is not proof of login and must be replaced by a server-validated session bootstrap.

Implementation sequence:

1. Close public role escalation and decide public/private endpoint policy.
2. Add access-token issue/verification, refresh-session persistence and explicit `authenticate`/`requireRole`/resource policies.
3. Apply policies to routes; derive actor IDs from `req.user`; preserve target IDs and check ownership/participation.
4. Consolidate duplicate admin KYC routes; validate mutable field allowlists and subscription entitlements.
5. Update frontend auth bootstrap, Bearer API client, login/logout and protected routes without trusting cached profile state.
6. Add authentication, authorization, IDOR and spoofing regression tests; verify missing/invalid/expired tokens, USER vs ADMIN, actor/target mismatch and refresh/logout behavior.
7. Deploy database/env/backend first, then frontend, and require old clients to sign in again. Review audit logs for prior suspicious changes; source alone cannot prove whether the vulnerabilities were exploited.

Standards references: [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [JWT Best Current Practices RFC 8725](https://www.rfc-editor.org/rfc/rfc8725).

## Implementation result (after the audit)

The backend now issues 15-minute HS256 access JWTs with `sub`, `sid`, `token_use`, `jti`, `iss` and `aud`; it stores only a hash of an opaque rotating seven-day refresh token in `auth_sessions`. `authenticate` checks the JWT, session row and current `users` row, then sets `req.user`; `requireRole` handles role gates. Refresh cookies are HttpOnly, have a narrow path, and use a configured SameSite/Secure policy. Cookie-changing auth endpoints check their browser Origin against `CLIENT_ORIGINS`. Registration only accepts `USER`/`AGENT`.

Admin KYC and review routes, report administration, agent overview/KYC/subscriptions, chat, favorites, OTP, trust score, avatar, and listing mutations now use authenticated IDs and role gates. Agent funnel changes additionally require an existing conversation with the target user. Listing update/delete checks the stored owner against `req.user.id`, while the listing-create controller overwrites any submitted `owner_id`. Subscription state/price can no longer be set from client fields; only a server-priced free trial can be started. Paid activation now fails closed pending payment integration. The duplicate, weaker legacy admin KYC routes and handlers were removed.

The frontend stores access tokens only in memory, restores a server-validated session with the HttpOnly refresh cookie, attaches Bearer tokens through `apiFetch`, and gates admin/agent pages using the restored profile. `localStorage.user` remains a non-authoritative display cache; editing it cannot create a valid Bearer token. Existing browser sessions must reauthenticate. Deployment prerequisites and caveats are in `server/README-auth.md`.

Remaining boundaries: public listing reads intentionally remain public. KYC Storage currently constructs public document URLs, which is a separate sensitive-data exposure requiring a private-bucket/signed-URL migration. Production RLS, actual storage-bucket ACLs, payment integrations, and live deployment have not been verified from this workspace. The new backend cannot start until the migration and server secrets are supplied. Temporary automated tests covering tokens, roles, spoofing, refresh replay and ownership passed during implementation, but their files were later removed at the user's request. Frontend build and JavaScript syntax checks also ran. Staging end-to-end verification is still required.
