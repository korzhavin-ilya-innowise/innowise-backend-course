import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

import { ConfigService } from '@/core/config/config.service';

export interface RegistrationMail {
  to: string;
  /** OTP code; set for method "otp". */
  code?: string;
  /** Full confirmation link; set for method "magic_link". */
  link?: string;
}

/** Abstract class doubles as the DI token, so tests can provide a mock. */
export abstract class EmailService {
  abstract sendRegistrationConfirmation(mail: RegistrationMail): Promise<void>;
}

@Injectable()
export class SmtpEmailService extends EmailService {
  private readonly logger = new Logger(SmtpEmailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    super();
  }

  private getTransporter(): Transporter {
    this.transporter ??= createTransport({
      host: this.config.get('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT')),
      secure: String(this.config.get('SMTP_SECURE')) === 'true',
      auth: this.config.get('SMTP_USER')
        ? {
            user: this.config.get('SMTP_USER'),
            pass: this.config.get('SMTP_PASSWORD'),
          }
        : undefined,
    });
    return this.transporter;
  }

  async sendRegistrationConfirmation(mail: RegistrationMail): Promise<void> {
    const body = mail.code
      ? `Your confirmation code: ${mail.code}\nIt is valid for 10 minutes.`
      : `Confirm your registration: ${mail.link}\nThe link is valid for 10 minutes.`;
    await this.getTransporter().sendMail({
      from: this.config.get('SMTP_FROM'),
      to: mail.to,
      subject: 'Confirm your registration',
      text: body,
    });
    // Never log the code or link.
    this.logger.log('Registration confirmation email sent');
  }
}
