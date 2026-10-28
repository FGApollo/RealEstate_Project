import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './PlanDialog.css';

export default function PlanDialog({ title, onClose, locked = false, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`plan-dialog${wide ? ' plan-dialog-wide' : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <div className="plan-dialog-heading"><h2>{title}</h2><button type="button" aria-label="Đóng" disabled={locked} onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
