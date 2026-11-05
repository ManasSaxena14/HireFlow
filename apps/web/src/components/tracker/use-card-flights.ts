'use client';

import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

interface Flight {
  id: string;
  status: string;
  from: DOMRect;
}

const isOffer = (status: string) => status === 'offer';

const BURST_COLORS = ['#ff4b32', '#3ddc97', '#ffc24b', '#5cb8ff', '#f6f7f8'];

/** A small burst of dots, used when a job reaches the Offer column. */
function burst(rect: DOMRect) {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (let index = 0; index < 22; index++) {
    const dot = document.createElement('span');
    const size = 5 + Math.random() * 6;
    Object.assign(dot.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: index % 2 ? '9999px' : '2px',
      background: BURST_COLORS[index % BURST_COLORS.length],
      pointerEvents: 'none',
      zIndex: '70',
    });
    dot.setAttribute('aria-hidden', 'true');
    document.body.append(dot);
    const angle = (index / 22) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 80 + Math.random() * 110;
    dot
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${Math.cos(angle) * reach}px), calc(-50% + ${
              Math.sin(angle) * reach + 40
            }px)) scale(0.4) rotate(200deg)`,
            opacity: 0,
          },
        ],
        { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      )
      .finished.finally(() => dot.remove());
  }
}

/**
 * Makes a moved card fly to its new column. The columns clip their content, so a copy
 * of the card flies above the page while the real card waits, hidden, at the end point.
 */
export function useCardFlights(
  boardRef: RefObject<HTMLElement | null>,
  onLanded: (status: string) => void,
  celebrates: (status: string) => boolean = isOffer,
) {
  const pending = useRef<Flight | null>(null);

  const launch = useCallback(
    (id: string, status: string, from?: DOMRect) => {
      const start =
        from ??
        boardRef.current
          ?.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
          ?.getBoundingClientRect();
      pending.current = start && !prefersReducedMotion() ? { id, status, from: start } : null;
    },
    [boardRef],
  );

  useLayoutEffect(() => {
    const flight = pending.current;
    if (!flight) return;
    const card = boardRef.current?.querySelector<HTMLElement>(
      `[data-card-id="${flight.id}"][data-card-status="${flight.status}"]`,
    );
    if (!card) return;
    pending.current = null;

    const to = card.getBoundingClientRect();
    const copy = card.cloneNode(true) as HTMLElement;
    copy.removeAttribute('data-testid');
    copy.removeAttribute('data-card-id');
    copy.classList.remove('animate-card-in');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    const select = copy.querySelector('select');
    if (select) select.value = flight.status;
    const column = card.closest<HTMLElement>('section');
    const color = column ? getComputedStyle(column).getPropertyValue('--status') : '#ff4b32';
    Object.assign(copy.style, {
      position: 'fixed',
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: '0',
      zIndex: '60',
      pointerEvents: 'none',
      listStyle: 'none',
      borderColor: color,
      boxShadow: '0 24px 50px -16px rgb(0 0 0 / 0.9)',
    });
    document.body.append(copy);
    card.style.visibility = 'hidden';

    const dx = flight.from.left - to.left;
    const dy = flight.from.top - to.top;
    const animation = copy.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.03) rotate(2deg)` },
        {
          transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px) scale(1.05) rotate(1.5deg)`,
          offset: 0.55,
        },
        { transform: 'none' },
      ],
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );

    animation.finished.finally(() => {
      copy.remove();
      card.style.visibility = '';
      column?.animate(
        [
          { boxShadow: `0 0 0 0 color-mix(in srgb, ${color} 55%, transparent)` },
          { boxShadow: `0 0 0 8px transparent` },
        ],
        { duration: 650, easing: 'ease-out' },
      );
      if (celebrates(flight.status)) burst(to);
      onLanded(flight.status);
    });
  });

  return launch;
}
