import type { ReactNode } from 'react';
import { ProtectedArea } from '@/components/protected-area';

export default function CompanyAreaLayout({ children }: { children: ReactNode }) {
  return <ProtectedArea>{children}</ProtectedArea>;
}
