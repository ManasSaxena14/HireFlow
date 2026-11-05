'use client';

import { useParams } from 'next/navigation';
import { CandidateDetails } from '@/components/hiring/candidate-details';
import { useCompanyRole } from '../../use-membership';

export default function CandidatePage() {
  const { aid } = useParams<{ aid: string }>();
  const { cid, role } = useCompanyRole();
  return <CandidateDetails cid={cid} id={aid} role={role} />;
}
