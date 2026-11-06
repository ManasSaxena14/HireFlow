export const MAIL_QUEUE = 'mail';
export const REMINDERS_SCAN_QUEUE = 'reminders-scan';

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
    };
