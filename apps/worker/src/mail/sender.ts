import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config.js';
import type { RenderedMail } from './templates.js';

export interface MailSender {
  send(to: string, mail: RenderedMail): Promise<void>;
}

/** Saves each email to .mail-preview/, so you do not need a mail account in development. */
export class PreviewSender implements MailSender {
  constructor(
    private readonly directory: string,
    private readonly onWrite: (path: string) => void,
  ) {}

  async send(to: string, mail: RenderedMail): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = join(this.directory, `${Date.now()}-${to.replace(/[^a-z0-9]+/gi, '-')}.html`);
    await writeFile(file, mail.html);
    this.onWrite(file);
  }
}

export class SmtpSender implements MailSender {
  private readonly transport: Transporter;

  constructor(
    env: Env,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  async send(to: string, mail: RenderedMail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, ...mail });
  }
}
