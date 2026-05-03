// src/mail/mail.service.ts
import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private mailer: MailerService) {}

  async sendVerificationEmail(opts: {
    to: string;
    name: string;
    token: string;
    baseUrl: string;
  }) {
    const url = `${opts.baseUrl}/verify-email?token=${opts.token}`;

    await this.mailer.sendMail({
      to: opts.to,
      subject: 'Verifikasi Email Kamu — War Tiket',
      template: 'verify-email', // src/mail/templates/verify-email.hbs
      context: { name: opts.name, url },
    });
  }

  async sendResetPasswordEmail(opts: {
    to: string;
    name: string;
    token: string;
    baseUrl: string;
  }) {
    const url = `${opts.baseUrl}/reset-password?token=${opts.token}`;

    await this.mailer.sendMail({
      to: opts.to,
      subject: 'Reset Password — War Tiket',
      template: 'reset-password', // src/mail/templates/reset-password.hbs
      context: { name: opts.name, url },
    });
  }
}
