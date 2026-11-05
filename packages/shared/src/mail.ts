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
    };
