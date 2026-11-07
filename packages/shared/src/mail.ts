export const MAIL_QUEUE = 'mail';
export const REMINDERS_SCAN_QUEUE = 'reminders-scan';
export const CLEANUP_QUEUE = 'cleanup';
export const FEED_FETCH_QUEUE = 'feed-fetch';
export const ALERTS_MATCH_QUEUE = 'alerts-match';
export const ALERTS_DIGEST_QUEUE = 'alerts-digest';

export interface JobAlertGroup {
  alertName: string;
  jobs: { title: string; companyName: string; location: string | null; url: string }[];
}

export type MailMessage =
  | { template: 'verify-email'; to: string; dedupeKey: string; name: string; link: string }
  | { template: 'reset-password'; to: string; dedupeKey: string; name: string; link: string }
  | {
      template: 'reminder';
      to: string;
      dedupeKey: string;
      name: string;
      message: string;
      link: string;
    }
  | {
      template: 'application-received';
      to: string;
      dedupeKey: string;
      name: string;
      jobTitle: string;
      companyName: string;
      link: string;
    }
  | {
      template: 'stage-update';
      to: string;
      dedupeKey: string;
      subject: string;
      body: string;
      companyName: string;
      link: string;
    }
  | {
      template: 'interview';
      kind: 'booked' | 'moved' | 'cancelled' | 'reminder';
      to: string;
      dedupeKey: string;
      name: string;
      jobTitle: string;
      companyName: string;
      /** The time, already written in the time zone of the person getting this email. */
      when: string;
      withName: string;
      meetingUrl: string | null;
      link: string;
      linkLabel: string;
    }
  | {
      template: 'interview-offer';
      to: string;
      dedupeKey: string;
      name: string;
      jobTitle: string;
      companyName: string;
      durationMin: number;
      expires: string;
      link: string;
    }
  | {
      template: 'job-alert';
      kind: 'instant' | 'daily';
      to: string;
      dedupeKey: string;
      name: string;
      groups: JobAlertGroup[];
      /** Jobs left out to keep the email short. They can all be seen on the site. */
      moreCount: number;
      link: string;
    };
