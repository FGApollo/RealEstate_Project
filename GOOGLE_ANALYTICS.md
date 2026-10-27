# Google Analytics 4 — Swipe Nest

The frontend loads the Google tag once, before React renders. No additional package
is required. GA4 enhanced measurement tracks the initial page view and React Router
history changes; do not also send manual `page_view` events.

## Current configuration

- Measurement ID: `G-M6J1HP7LTP` (public identifier, not an API secret).
- Production hostname: `real-estate-project-tan-omega.vercel.app`.
- Tracking runs only in production builds on that hostname. Development, local
  previews and Vercel preview URLs do not load the tag.
- `vercel.json` permits the Google tag script through the existing Content Security
  Policy. No inline-script permission is needed.

These defaults are included in the frontend build, so no Vercel environment change
is required for the current domain. To change them, set these frontend environment
variables in Vercel and redeploy:

```env
VITE_GA_MEASUREMENT_ID=G-M6J1HP7LTP
VITE_GA_HOSTNAME=real-estate-project-tan-omega.vercel.app
```

Use a hostname without `https://`, a path or a trailing slash. An empty
`VITE_GA_MEASUREMENT_ID` disables tracking. If the production domain changes, update
`VITE_GA_HOSTNAME` as well as the web stream URL in Google Analytics.

## Complete setup in Google Analytics

1. Open **Admin → Data streams → Swipe Nest Web**.
2. In **Enhanced measurement**, open the settings for **Page views**.
3. Under advanced settings, enable **Page loads** and **Page changes based on
   browser history events**, then save.
4. Deploy the updated frontend to Vercel production.
5. Visit the production website and navigate between screens. Check **Reports →
   Realtime** for activity.
6. For detailed verification, connect the website with
   [Tag Assistant](https://tagassistant.google.com/) and inspect **Admin → DebugView**.
   Each screen navigation should produce one `page_view` with the new page location.

The data-collection warning can remain until Google receives and processes activity
from the deployed tag. Local builds alone do not connect the live site to GA4.

## Scope

This integration collects GA4 page views and the web stream's enabled automatic
events. Business actions such as successful sign-up, saving a property, contacting
an agent or completing a verified payment need separate event instrumentation.
The existing Admin analytics continues to use application database records.

Do not add email addresses, phone numbers, authentication tokens or chat contents
to Analytics parameters or tracked URL query strings. Leave the built-in page
location handling in place so authentication URL fragments are excluded.

## References

- [Set up Google Analytics](https://support.google.com/analytics/answer/9304153)
- [Measure single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [Content Security Policy for Google Analytics](https://developers.google.com/tag-platform/security/guides/csp)
- [Monitor events in DebugView](https://support.google.com/analytics/answer/7201382)
