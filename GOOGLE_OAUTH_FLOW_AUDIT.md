# Google OAuth and account provisioning — pre-change audit and design

This source audit was completed before the Google Agent flow was modified. It describes repository behavior, not a live Google/Supabase deployment.

## CURRENT FLOW

| Step | Current file/function | Observed behavior |
|---|---|---|
| UI | `src/main.jsx` | `GoogleOAuthProvider` receives `VITE_GOOGLE_CLIENT_ID`. |
| Button | `src/pages/Login.jsx` and `src/pages/Register.jsx`, `useGoogleLogin` | Default token flow gives a Google `access_token`; both pages send it as `credential` to `POST /api/google-login`. `/login/agent` and `/register/agent` have no Google button. |
| Route/controller | `server/routes/authRoutes.js`, `authController.googleLogin` | Reads `credential`; calls `authService.googleLogin`; creates application session on success. |
| Google verification | `server/services/authService.js`, `googleLogin` | JWT-shaped input goes through `googleClient.verifyIdToken` with `GOOGLE_CLIENT_ID` audience. Other input goes to Google userinfo with a Bearer access token. Both require `email_verified`. This is two different mechanisms selected by token shape, not an explicit contract. |
| Identity/profile | `authService.googleLogin` | Reads Google `email` and `name`; ignores Google `sub` and `picture`. |
| Lookup | `authService.googleLogin` | Searches `users.email` for an exact match. No provider-subject binding or visible case-insensitive uniqueness guarantee. |
| Existing | `authService.googleLogin` | Returns the existing database user unchanged, including role. A USER is not promoted by visiting an Agent page; an AGENT is not downgraded by a USER page. |
| New | `authService.googleLogin` | Inserts `users` with `password: null` and `role: USER`; no Agent provisioning context or phone. |
| Session | `authController.respondWithSession` → `authSessionService.createSession` | Returns public user and a 15-minute HS256 access JWT; creates a hashed, rotating seven-day refresh session and sets an HttpOnly cookie. JWT has subject user ID and session ID, not role. Protected API middleware reloads the user/role from DB. |
| Frontend auth/redirect | `src/auth/AuthContext.jsx`, `src/pages/Login.jsx`, `src/pages/Register.jsx` | Access token stored in memory, `localStorage.user` is display cache. Login redirects by returned DB role; Register's Google flow always redirects `/` even if an existing AGENT logs in. |

## ROOT CAUSE AND TRUST BOUNDARY

Google verifies a person's Google identity, not the app's USER/AGENT/ADMIN role. The existing Google endpoint combines login and provisioning; its new-user branch hardcodes USER. The Agent login and registration pages lack Google OAuth UI. An access token accepted through Google userinfo proves a Google token works at userinfo but does not enforce the application's OAuth client ID as the current ID-token branch does. Exact email matching without a stable Google `sub` binding risks duplicate accounts or unsafe later relinking.

Trusted: a Google ID token verified on the server for the configured audience, including `sub`, `email` and `email_verified`; existing role from `users`; ownership/authorization from backend DB checks. Untrusted: page visited, `intent`, `role`, `email`, localStorage, React state. `intent` is only a request to provision a *new* account, never proof of role or permission.

## BUSINESS RULE FOUND IN THE CODE

`src/pages/RegisterAgent.jsx` posts name, email, phone, password and `role: AGENT` to `/api/register`; UI requires all fields. `server/services/authService.registerUser` currently whitelists USER/AGENT and immediately inserts that role but does not enforce phone server-side. There is no separate Agent profile table or license/document approval requirement in the registration code. Agent KYC is subsequent: `identity_verifications` has PENDING/APPROVED/REJECTED, while `users.verification_status` is displayed as UNVERIFIED/PENDING/VERIFIED/REJECTED. `kycService.uploadCard` and `uploadSelfie` advance verification; admin KYC can approve/reject. `CreateListingWizard` explicitly says an unverified Agent may post without a Verified badge, and `propertyRoutes`/`propertyService` check AGENT role but not VERIFIED status. Therefore the matching Google Agent rule is: verified Google identity + required phone → create AGENT with the same initial DB verification default as password registration; KYC remains separate. This is not a claim that KYC has been completed.

The users-table schema/defaults and live RLS settings are not in the repository. The implementation must avoid inventing a new verification state and test against staging.

## PROPOSED FLOW AND ACCOUNT CASES

Use one reusable Google button and one server endpoint accepting an exact registration intent: `LOGIN`, `USER_SIGNUP`, or `AGENT_SIGNUP`. Reject unknown intent and reject any submitted `role`, `adminId`, or identity field. `LOGIN` does not silently create an account; signup intents apply only if no account exists. `AGENT_SIGNUP` also requires a phone on the backend. Neither signup intent can create ADMIN. After Google ID-token verification, resolve Google `sub` mapping first; otherwise look up normalized email. Existing account role always remains DB role regardless of intent/page. Auto-link an unbound account by email only when Google is authoritative for that address (`@gmail.com` or verified Workspace `hd`); for third-party email without `hd`, require a separate authenticated account-linking step rather than silently taking over an existing email/password account. New accounts are provisioned atomically with a unique normalized email and unique Google subject, so OAuth and password methods cannot create duplicates for one email. A second, different Google subject must not silently attach to an already-linked user.

| Scenario | Result |
|---|---|
| Existing USER on Agent Google page | Login as USER; redirect to USER area, no promotion. |
| Existing AGENT on normal Google page | Login as AGENT; redirect to Agent area, no downgrade. |
| Existing ADMIN via Google | Keep ADMIN from DB; Google/signup intent cannot grant ADMIN. |
| Existing email/password account, first Google use | Link verified authoritative Google identity to same user (or require authenticated link for non-authoritative third-party email), preserve DB role. |
| New USER signup | Create USER, no AGENT privilege. |
| New AGENT signup | Require phone, create AGENT with same initial verification default as password Agent registration; subsequent KYC unchanged. |
| New identity on LOGIN page | No silent creation; guide to signup page. |
| `role: ADMIN`, modified localStorage, or modified intent | Reject arbitrary role; whitelist intent. LocalStorage and intent cannot override DB authorization. |

## SECURITY RISKS

Current role hardcode is a functional gap, not an ADMIN escalation. The larger risks in this flow are auto-linking by email without a stable provider subject, accepting userinfo access tokens without explicit app-audience verification, inconsistent account email casing/uniqueness, and accidental privilege changes if page context is mistaken for role authority. The existing Google branch catches all errors as 401, conflating bad credentials with account/DB failures; this should be split.

## BLAST RADIUS

`Login.jsx`, `LoginAgent.jsx`, `Register.jsx`, `RegisterAgent.jsx`, reusable Google UI/redirect, `authController.googleLogin`, `authService` registration/provisioning, Google identity verification, a DB migration for normalized email and provider-subject binding, session creation (same mechanism), tests and deployment configuration. Existing Google accounts have no subject mapping and need first-login linking; non-Gmail accounts may require explicit linking. No KYC or authorization rule should be relaxed.

## IMPLEMENTATION PLAN

1. Normalize the Google credential contract to a Google ID token verified server-side with the configured audience; extract `sub`, verified email, name and picture.
2. Split identity verification, existing-account resolution, and new-account provisioning; normalize email and bind unique Google subject in the database with atomic operations.
3. Centralize USER/AGENT signup rules, including required Agent phone; never permit public ADMIN provisioning.
4. Accept only whitelisted registration intents. Keep existing role from DB regardless of intent; handle unbound third-party-email accounts safely.
5. Add reusable Google UI to Login/Register and Agent Login/Register, and one redirect based only on the returned authenticated role.
6. Add regression tests for all account cases, spoofed role/intent, duplicate prevention and token/session behavior; run frontend build and backend tests.

## TEST PLAN

Stub verified Google identity and database to test existing USER/AGENT/ADMIN, first Google login for email/password accounts, new USER/AGENT, missing Agent phone, unknown intent, `role: ADMIN`, duplicate subject/email conflicts, and different subject on a linked account. Exercise login from both UI surfaces; assert ID token verification rejects wrong audience, backend role comes from DB, JWT carries only identity/session claims, and changing `localStorage.user.role` does not change backend authorization. Run staging tests with a real Google credential and the migration before deployment.

Primary references: [Google backend ID-token verification](https://developers.google.com/identity/sign-in/web/backend-auth), [react-oauth Google package](https://github.com/MomenSherif/react-oauth).

## IMPLEMENTED FLOW (after the audit)

The four auth pages now use `src/components/GoogleAuthButton.jsx`. The Google SDK's `GoogleLogin` button returns an ID-token `credential`, which the component posts with only a whitelisted `intent` and, for `AGENT_SIGNUP`, phone. `server/controllers/authController.googleLogin` rejects any additional field (including `role`), and `server/services/googleIdentityService.verifyGoogleIdentity` verifies the ID token against `GOOGLE_CLIENT_ID`, extracts `sub`, verified email, name and HTTPS avatar, and determines whether the email is authoritative for safe automatic linking.

`server/services/authService.googleLogin` first resolves `google_identities.subject`, then a normalized `users.email`. Existing users retain DB roles regardless of page or intent. New accounts require `USER_SIGNUP`/`AGENT_SIGNUP`; the latter requires phone. Both Google and password signup use `registrationPolicy.resolvePublicRegistration`, and their controllers reject a raw `role` field. Provisioning uses the server-only `provision_google_user` RPC in `004-google-identities.sql`, which atomically inserts the user and subject and only permits USER/AGENT. It leaves the same DB verification defaults used by password registration. `authController.respondWithSession` then uses the existing access-JWT and refresh-session machinery, while the frontend redirects through `roleDestination` based on the returned DB role.

Deployment is pending: run migration `004-google-identities.sql` and configure matching backend/frontend Google client IDs before real OAuth can work. Existing password accounts with non-Gmail/non-Workspace emails must confirm their password in the reusable Google UI before linking; new accounts using such emails and legacy Google-only accounts without a password still need an email-challenge/recovery process. Temporary unit tests passed during implementation but their files were removed at the user's request; they could not verify live Google configuration, table constraints, KYC defaults or OAuth consent-screen origins. The pre-change table above remains as audit history, not current behavior.
