import type { ReactNode } from 'react';
import { ProtectedArea } from '@/components/protected-area';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ProtectedArea>{children}</ProtectedArea>;
}
