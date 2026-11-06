'use client';

import { AvailabilityEditor } from '@/components/scheduler/availability-editor';
import { useCompanyRole } from '../use-membership';

export default function AvailabilityPage() {
  const { cid } = useCompanyRole();
  return <AvailabilityEditor cid={cid} />;
}
