'use client';

import { useEffect } from 'react';

/** One listener for the whole site. It tells any `.spot` tile where the mouse is. */
export function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;
    const onMove = (event: PointerEvent) => {
      const tile = (event.target as Element | null)?.closest?.<HTMLElement>('.spot');
      if (!tile) return;
      const box = tile.getBoundingClientRect();
      tile.style.setProperty('--x', `${event.clientX - box.left}px`);
      tile.style.setProperty('--y', `${event.clientY - box.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
  return null;
}
