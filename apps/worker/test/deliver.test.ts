import { randomUUID } from 'node:crypto';
import type { MailMessage } from '@hireflow/shared';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { deliverMail } from '../src/mail/deliver.js';
import type { MailSender } from '../src/mail/sender.js';
import { renderMail, type RenderedMail } from '../src/mail/templates.js';

const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? 'postgresql://hireflow@localhost:5433/hireflow_test',
});

class RecordingSender implements MailSender {
  readonly sent: { to: string; mail: RenderedMail }[] = [];
  failNext = false;

  async send(to: string, mail: RenderedMail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('smtp down');
    }
    this.sent.push({ to, mail });
  }
}

const message = (): MailMessage => ({
  template: 'reminder',
  to: 'someone@example.com',
  name: 'Someone',
  message: 'Follow up on your application',
  link: 'http://localhost:3000/app/tracker/1',
  dedupeKey: `test:${randomUUID()}`,
});

describe('deliverMail', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('sends a message once', async () => {
    const sender = new RecordingSender();
    await expect(deliverMail(pool, sender, message())).resolves.toBe('sent');
    expect(sender.sent).toHaveLength(1);
  });

  it('skips a job that runs a second time', async () => {
    const sender = new RecordingSender();
    const mail = message();
    await deliverMail(pool, sender, mail);
    await expect(deliverMail(pool, sender, mail)).resolves.toBe('duplicate');
    expect(sender.sent).toHaveLength(1);
  });

  it('sends once when two workers race on the same job', async () => {
    const sender = new RecordingSender();
    const mail = message();
    const outcomes = await Promise.all([
      deliverMail(pool, sender, mail),
      deliverMail(pool, sender, mail),
    ]);
    expect(outcomes.sort()).toEqual(['duplicate', 'sent']);
    expect(sender.sent).toHaveLength(1);
  });

  it('lets a retry through when the send failed', async () => {
    const sender = new RecordingSender();
    const mail = message();
    sender.failNext = true;
    await expect(deliverMail(pool, sender, mail)).rejects.toThrow('smtp down');
    await expect(deliverMail(pool, sender, mail)).resolves.toBe('sent');
    expect(sender.sent).toHaveLength(1);
  });
});

describe('renderMail', () => {
  it('escapes user-supplied text in the HTML body', () => {
    const { html, text } = renderMail({
      ...(message() as Extract<MailMessage, { template: 'reminder' }>),
      name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain('http://localhost:3000/app/tracker/1');
  });
});

describe('hiring emails', () => {
  it('confirms an application in simple words', () => {
    const mail = renderMail({
      template: 'application-received',
      to: 'asha@example.com',
      dedupeKey: 'application-received:1',
      name: 'Asha',
      jobTitle: 'Designer',
      companyName: 'Northwind',
      link: 'http://localhost:3000/c/northwind/jobs/designer',
    });
    expect(mail.subject).toBe('We got your application for Designer');
    expect(mail.text).toContain('Northwind got your application');
  });

  it('sends the words of a step email safely, one paragraph at a time', () => {
    const mail = renderMail({
      template: 'stage-update',
      to: 'asha@example.com',
      dedupeKey: 'stage-update:1',
      subject: 'Next step',
      body: 'Hi Asha,\n\nWe <b>liked</b> your work.',
      companyName: 'Northwind',
      link: 'http://localhost:3000/c/northwind/jobs/designer',
    });
    expect(mail.subject).toBe('Next step');
    expect(mail.html).toContain('We &lt;b&gt;liked&lt;/b&gt; your work.');
    expect(mail.html).not.toContain('<b>liked');
    expect(mail.html.match(/<p /g)).toHaveLength(2);
  });
});
