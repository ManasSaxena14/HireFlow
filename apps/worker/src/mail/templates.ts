import type { MailMessage } from '@hireflow/shared';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function layout(heading: string, lines: string[], action: { label: string; href: string }): string {
  const paragraphs = lines
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4047">${escapeHtml(line)}</p>`,
    )
    .join('');
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#eef0f2;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
    <table role="presentation" align="center" width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;border-collapse:separate">
      <tr><td style="padding:20px 32px;background:#17191c;border-radius:8px 8px 0 0;font-size:16px;font-weight:700;color:#ffffff">HireFlow</td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 16px;font-size:20px;color:#17191c">${escapeHtml(heading)}</h1>
        ${paragraphs}
        <a href="${escapeHtml(action.href)}" style="display:inline-block;margin-top:8px;padding:11px 20px;background:#ff4b32;border-radius:10px;font-size:14px;font-weight:600;color:#17191c;text-decoration:none">${escapeHtml(action.label)}</a>
      </td></tr>
    </table>
  </body>
</html>`;
}

function compose(
  subject: string,
  heading: string,
  lines: string[],
  action: { label: string; href: string },
): RenderedMail {
  return {
    subject,
    text: `${lines.join('\n\n')}\n\n${action.label}: ${action.href}\n`,
    html: layout(heading, lines, action),
  };
}

export function renderMail(message: MailMessage): RenderedMail {
  switch (message.template) {
    case 'verify-email':
      return compose(
        'Confirm your email for HireFlow',
        'Confirm your email',
        [
          `Hi ${message.name},`,
          'Please confirm your email so we can send you reminders. This link works for 24 hours.',
        ],
        { label: 'Confirm email', href: message.link },
      );
    case 'reset-password':
      return compose(
        'Reset your HireFlow password',
        'Reset your password',
        [
          `Hi ${message.name},`,
          'Click the button below to set a new password. This link works for one hour. If you did not ask for this, you can ignore this email.',
        ],
        { label: 'Set a new password', href: message.link },
      );
    case 'reminder':
      return compose(
        'Your HireFlow reminder',
        'Reminder',
        [`Hi ${message.name},`, message.message],
        { label: 'Open this job', href: message.link },
      );
    case 'application-received':
      return compose(
        `We got your application for ${message.jobTitle}`,
        'Thank you for applying',
        [
          `Hi ${message.name},`,
          `${message.companyName} got your application for ${message.jobTitle}. The team will look at it and contact you about the next step.`,
        ],
        { label: 'See the job', href: message.link },
      );
    case 'stage-update':
      return compose(message.subject, message.companyName, message.body.split(/\n\s*\n/), {
        label: 'See the job',
        href: message.link,
      });
  }
}
