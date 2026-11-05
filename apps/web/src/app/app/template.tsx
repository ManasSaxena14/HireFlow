import type { ReactNode } from 'react';

/** Next.js remounts this on each page change, so every page fades in softly. */
export default function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-page lg:h-full">{children}</div>;
}
