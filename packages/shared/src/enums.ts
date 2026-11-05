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

export const JOB_STATUSES = ['draft', 'open', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const STAGE_KINDS = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const RECOMMENDATIONS = ['strong_no', 'no', 'yes', 'strong_yes'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
