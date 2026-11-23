import { useId } from 'react';
import { Check } from 'lucide-react';

export default function PlusCrownIcon({
  size = 56,
  withRays = false,
  withCheck = false,
  className = '',
  svgClassName = ''
}) {
  const uid = useId().replace(/:/g, '');
  const bodyId = `crownBody-${uid}`;
  const rimId = `crownRim-${uid}`;
  const pearlId = `crownPearl-${uid}`;
  const shadowId = `crownShadow-${uid}`;

  return (
    <span className={`plus-crown-emblem ${withRays ? 'has-rays' : ''} ${className}`.trim()} aria-hidden="true">
      {withRays && (
        <svg className="plus-crown-rays" viewBox="0 0 116 56" fill="none">
          <path d="M16 18L24 23" stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M11 32L21 32" stroke="#fbbf24" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M100 18L92 23" stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M105 32L95 32" stroke="#fbbf24" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      )}
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={`plus-crown-svg ${svgClassName}`.trim()}>
        <defs>
          <linearGradient id={bodyId} x1="12" y1="14" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffe885" />
            <stop offset="48%" stopColor="#ffc133" />
            <stop offset="100%" stopColor="#e58a08" />
          </linearGradient>
          <linearGradient id={rimId} x1="14" y1="45" x2="50" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffd75e" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id={pearlId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff8d6" />
            <stop offset="55%" stopColor="#ffcb47" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <filter id={shadowId} x="4" y="8" width="56" height="52" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#f59e0b" floodOpacity="0.28" />
          </filter>
        </defs>
        <g filter={`url(#${shadowId})`}>
          <path
            d="M12 25.5C11.6 23.6 13.8 22.3 15.3 23.5L23.5 30.2L30.2 17.6C31 16.1 33 16.1 33.8 17.6L40.5 30.2L48.7 23.5C50.2 22.3 52.4 23.6 52 25.5L47.8 45.2C47.4 47 45.8 48.2 44 48.2H20C18.2 48.2 16.6 47 16.2 45.2L12 25.5Z"
            fill={`url(#${bodyId})`}
          />
          <rect x="16" y="45" width="32" height="6.2" rx="3.1" fill={`url(#${rimId})`} />
          <path
            d="M16.5 27.5L23.8 33.2L32 19.5L36.2 27.5"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12.5" cy="21" r="3.6" fill={`url(#${pearlId})`} />
          <circle cx="32" cy="14" r="4.4" fill={`url(#${pearlId})`} />
          <circle cx="51.5" cy="21" r="3.6" fill={`url(#${pearlId})`} />
          <path
            d="M32 28.2L33.9 32.1L38.2 32.7L35.1 35.7L35.8 40L32 37.9L28.2 40L28.9 35.7L25.8 32.7L30.1 32.1L32 28.2Z"
            fill="#ffffff"
            fillOpacity="0.96"
          />
        </g>
      </svg>
      {withCheck && (
        <span className="plus-crown-verified-dot">
          <Check size={13} strokeWidth={3.2} />
        </span>
      )}
    </span>
  );
}
