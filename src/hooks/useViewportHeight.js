import { useEffect } from 'react';

// Keep full-height chat/composer layouts inside the visual viewport when a
// mobile keyboard opens. Never counteract the user's pinch-to-zoom gesture.
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!viewport || viewport.scale === 1) {
          document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
        }
      });
    };
    update(); window.addEventListener('resize', update); viewport?.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener('resize', update); viewport?.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--app-viewport-height');
    };
  }, []);
}
