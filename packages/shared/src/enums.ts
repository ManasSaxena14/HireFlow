export const MEMBERSHIP_ROLES = ['admin', 'recruiter', 'hiring_manager', 'interviewer'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const TRACKER_STATUSES = [
  'saved',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];
