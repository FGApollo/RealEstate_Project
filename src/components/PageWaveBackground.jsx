import { useId } from 'react';

export default function PageWaveBackground({ className = '', waveClassName = '' }) {
  const uid = useId().replace(/:/g, '');
  const gradA = `waveA-${uid}`;
  const gradB = `waveB-${uid}`;

  return (
    <div className={className} aria-hidden="true">
      <svg className={waveClassName} viewBox="0 0 1440 320" preserveAspectRatio="none" fill="none">
        <path
          d="M0 192C220 132 420 260 720 218C1020 176 1220 92 1440 146V320H0V192Z"
          fill={`url(#${gradA})`}
        />
        <path
          d="M0 248C280 198 540 296 860 250C1120 212 1300 172 1440 202V320H0V248Z"
          fill={`url(#${gradB})`}
        />
        <defs>
          <linearGradient id={gradA} x1="0" y1="0" x2="1440" y2="320" gradientUnits="userSpaceOnUse">
            <stop stopColor="#dbeafe" stopOpacity="0.65" />
            <stop offset="1" stopColor="#bfdbfe" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={gradB} x1="0" y1="180" x2="1440" y2="320" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e0ecff" stopOpacity="0.8" />
            <stop offset="1" stopColor="#c7ddff" stopOpacity="0.55" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
