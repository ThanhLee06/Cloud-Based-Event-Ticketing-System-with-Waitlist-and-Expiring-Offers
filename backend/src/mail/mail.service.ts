import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Gửi email (OTP xác thực, sau này có thể dùng cho quên mật khẩu, vé điện tử...).
 *
 * MAIL_DRIVER=console (mặc định): không gửi thật, in nội dung ra terminal backend — dùng khi dev.
 * MAIL_DRIVER=smtp: gửi qua SMTP (vd. Gmail App Password, Amazon SES SMTP) theo SMTP_HOST/PORT/USER/PASS.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  get driver(): 'console' | 'smtp' {
    return this.config.get<'console' | 'smtp'>('MAIL_DRIVER') ?? 'console';
  }

  onModuleInit(): void {
    if (this.driver !== 'smtp') {
      this.logger.log('MAIL_DRIVER=console → email (mã OTP) sẽ được in ra terminal, không gửi thật.');
      return;
    }
    const port = this.config.get<number>('SMTP_PORT') ?? 587;
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port,
      secure: port === 465, // 465 = SSL; 587 = STARTTLS
      requireTLS: port === 587,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASS'),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    this.logger.log(`MAIL_DRIVER=smtp → gửi email qua ${this.config.get('SMTP_HOST')}:${port}`);
  }

  /** Gửi email; ném lỗi nếu SMTP thất bại để nơi gọi quyết định cách xử lý. */
  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `\n========== [MAIL:console] ==========\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n====================================`
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('MAIL_FROM'),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
