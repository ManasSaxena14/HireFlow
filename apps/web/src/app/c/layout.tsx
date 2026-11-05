import type { ReactNode } from 'react';

export default function CareersLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-canvas">{children}</div>;
}
