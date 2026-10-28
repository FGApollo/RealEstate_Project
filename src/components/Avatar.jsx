import { useState } from 'react';
import './Avatar.css';

export default function Avatar({ src, name = 'Tài khoản', className = '' }) {
  const [failed, setFailed] = useState(null);
  const displayName = typeof name === 'string' && name.trim() ? name.trim() : 'Tài khoản';
  const image = typeof src === 'string' && src.trim() ? src : null;
  const initials = displayName.split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
  return image && failed !== image
    ? <img className={className} src={image} alt={displayName} decoding="async" onError={() => setFailed(image)} />
    : <span className={`${className} avatar-fallback`} role="img" aria-label={displayName}>{initials}</span>;
}
