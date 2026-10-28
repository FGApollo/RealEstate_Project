# Mobile web review

## Scope

Responsive updates cover the public/authentication pages, home and discovery,
favorites, property details, customer profile/onboarding/chat, Agent dashboard
tabs and listing wizard, pricing/payment, and Admin moderation, audit, plans
and analytics tabs.

- Dashboard sidebars become disclosure menus instead of squeezing the content.
- Forms and cards reflow; wide tables scroll in their own containers.
- Touch controls, input sizes, safe-area padding and bounded modal scrolling
  improve small-screen use. Browser zoom remains enabled.
- Customer navigation uses a native modal dialog with Escape/focus handling.
- Chat tracks the visual viewport height and Agent chat switches between the
  conversation list and thread. Its mobile back action restores the list.
- Routes and heavy Agent tabs load on demand. Failed page downloads offer a
  reload action instead of a blank page.
- Missing profile photos use initials, missing phone numbers use an empty-data
  message, and property details no longer invent a 95% matching score.
- Favorites render immediately after their request finishes, without the
  previous artificial 600 ms loading delay.

## Verification

The browser suite uses the real React application, session/role guards and an
isolated PostgreSQL-compatible test database. Business content is explicitly
test-only. It never changes production records or payment settings.

- 230 screen checks at widths 320, 360, 390, 430 and 768 px passed: no document
  overflow or dashboard content squeezed by the desktop sidebar.
- 18 additional interaction/layout checks at 320, 390 and 768 px passed,
  including filters, loaded favorites, menus and chat at 420 px viewport height.
- Failed dynamic page download recovery was verified separately.
- 26 authentication tests passed.
- Payment browser regression passed, including authorization, checkout result,
  webhook idempotency, pagination and mobile/tablet layouts. The provider uses
  signed fixtures, not a live money transfer.
- Production build passed. Main JavaScript entry is about 257 kB (84 kB gzip),
  down from about 1,098 kB before route splitting. These are main-entry sizes,
  not the total size of every route combined.
- ESLint comparison found no newly introduced diagnostics in the 13 changed
  JavaScript/JSX files checked. Existing project diagnostics remain.

Artifacts are written under `.local/mobile-verification/`; this folder contains
screen captures, `results.json`, `interaction-results.json`, `lint-results.json`
and the build/authentication logs. Payment results are under
`.local/payos-verification/`.

## Reproduce

From the repository root, run `npm run build` and `npm run test:auth-flow`.
From `server/`, run `node tests/mobile.browser.cjs` with Playwright available.
Set `PLAYWRIGHT_MODULE_PATH` and `PLAYWRIGHT_EXECUTABLE_PATH` when using the
bundled runtime instead of a locally installed browser. The browser test starts
and stops its own local server and isolated database.

Optional environment variables:

- `MOBILE_WIDTHS=320,360,390,430,768` selects widths.
- `MOBILE_INTERACTIONS_ONLY=true` runs the extra interaction checks.
- `MOBILE_RESULT_TAG=interaction-results` selects the output report name.

The keyboard check resizes the browser viewport; it is not a physical iOS or
Android keyboard test. External map/location services are blocked in the local
suite, so their live availability and device-specific behavior still need a
physical-device check after deployment. No migration is needed for this patch.
