import { useEffect, useRef, useState } from 'react';

export function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const toggleRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = event => {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return;
        setOpen(false); toggleRef.current?.focus();
      } else if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, [open]);
  return { open, setOpen, containerRef, toggleRef, close: () => setOpen(false) };
}
