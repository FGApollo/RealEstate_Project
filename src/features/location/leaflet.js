import { useEffect, useState } from 'react';

export const DEFAULT_MAP_VIEWPORT = [10.7769, 106.7009]; // TP. Hồ Chí Minh (khung nhìn mặc định)

export const parsePinnedCoords = (latitude, longitude) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

/**
 * Shared loader for Leaflet CDN CSS + JS.
 * Only starts loading when `enabled` is true (e.g., property has pinned coords or step 1 map is visible).
 */
export const useLeafletCdn = (enabled = true) => {
  const [loaded, setLoaded] = useState(() => typeof window !== 'undefined' && Boolean(window.L));
  const [loadError, setLoadError] = useState(false);
  const mapLoaded = loaded || (typeof window !== 'undefined' && Boolean(window.L));

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || window.L) return undefined;

    const existingScript = document.querySelector('script[data-leaflet-cdn="1"]');
    if (existingScript) {
      const onLoad = () => { setLoaded(true); setLoadError(false); };
      const onError = () => setLoadError(true);
      existingScript.addEventListener('load', onLoad);
      existingScript.addEventListener('error', onError);
      return () => {
        existingScript.removeEventListener('load', onLoad);
        existingScript.removeEventListener('error', onError);
      };
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.dataset.leafletCdn = '1';
    script.onload = () => {
      setLoaded(true);
      setLoadError(false);
    };
    script.onerror = () => {
      console.error('Failed to load Leaflet CDN');
      setLoadError(true);
    };
    document.body.appendChild(script);
    return undefined;
  }, [enabled]);

  return { mapLoaded, mapLoadError: loadError };
};

