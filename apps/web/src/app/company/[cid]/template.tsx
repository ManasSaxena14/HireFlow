import type { ReactNode } from 'react';

export default function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-page lg:h-full">{children}</div>;
}
