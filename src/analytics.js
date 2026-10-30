// Measurement IDs are public. Environment variables can override these defaults.
const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? 'G-M6J1HP7LTP').trim();
const hostname = (import.meta.env.VITE_GA_HOSTNAME ?? 'real-estate-project-tan-omega.vercel.app').trim().toLowerCase();

export function initializeAnalytics() {
  // Keep development, local previews and Vercel preview deployments out of GA4.
  if (!import.meta.env.PROD || window.location.hostname !== hostname
    || !/^G-[A-Z0-9]+$/.test(measurementId)
    || document.getElementById('google-analytics-tag')) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  // Enhanced measurement handles React Router history changes in GA4.
  window.gtag('config', measurementId);

  const script = document.createElement('script');
  script.id = 'google-analytics-tag';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}
