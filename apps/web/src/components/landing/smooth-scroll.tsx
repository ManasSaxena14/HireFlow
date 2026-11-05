'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

/** Makes the mouse wheel glide on the landing page. People who ask for less motion skip it. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.09 });
    return () => lenis.destroy();
  }, []);
  return null;
}
