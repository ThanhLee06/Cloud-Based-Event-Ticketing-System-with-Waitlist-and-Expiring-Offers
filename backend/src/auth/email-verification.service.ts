import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { MailService } from '../mail/mail.service';
import { buildVerificationEmail } from '../mail/templates/verification-email';
import { PrismaService } from '../prisma/prisma.service';

export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

export interface IssueOtpResult {
  /** false = tạo mã xong nhưng gửi email thất bại (người dùng bấm "Gửi lại mã"). */
  emailSent: boolean;
  resendAvailableInSec: number;
}

/**
 * Xác thực email bằng mã OTP 6 số.
 * - Chỉ lưu HMAC-SHA256 của mã (khóa = JWT_SECRET), không lưu mã gốc.
 * - Mỗi user chỉ có 1 mã còn hiệu lực; gửi lại mã sẽ hủy mã cũ.
 * - Hết hạn sau 10 phút, sai quá 5 lần thì mã bị vô hiệu, phải xin mã mới.
 * - Phải chờ 60 giây giữa 2 lần gửi mã cho cùng 1 tài khoản.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  /** Tạo mã mới và gửi email. Ném 429 nếu chưa hết thời gian chờ gửi lại. */
  async issue(user: Pick<User, 'id' | 'email' | 'name'>): Promise<IssueOtpResult> {
    const latest = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latest) {
      const elapsedSec = Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      const waitSec = OTP_RESEND_COOLDOWN_SECONDS - elapsedSec;
      if (waitSec > 0) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            code: 'OTP_RESEND_COOLDOWN',
            message: `Vui lòng đợi ${waitSec} giây trước khi gửi lại mã.`,
            retryAfterSec: waitSec,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerification.deleteMany({ where: { userId: user.id } });
      return tx.emailVerification.create({
        data: {
          userId: user.id,
          codeHash: this.hash(user.id, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
        },
        select: { id: true },
      });
    });

    try {
      await this.mail.send(
        buildVerificationEmail({
          to: user.email,
          name: user.name,
          code,
          expiresInMinutes: OTP_TTL_MINUTES,
        })
      );
      return { emailSent: true, resendAvailableInSec: OTP_RESEND_COOLDOWN_SECONDS };
    } catch (err) {
      this.logger.error(`Gửi email OTP tới ${user.email} thất bại: ${String(err)}`);
      // Xóa mã chưa gửi được để người dùng bấm "Gửi lại" ngay, không phải chờ 60 giây.
      await this.prisma.emailVerification.deleteMany({ where: { id: record.id } });
      return { emailSent: false, resendAvailableInSec: 0 };
    }
  }

  /**
   * Kiểm tra mã. Đúng → đánh dấu đã xác thực và xóa mã. Sai → tăng số lần thử và ném 400.
   * Trả về user đã cập nhật.
   */
  async verify(email: string, code: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw this.otpError('OTP_INVALID', 'Mã xác thực không đúng hoặc đã hết hạn.');
    }
    if (user.emailVerifiedAt) {
      throw this.otpError('EMAIL_ALREADY_VERIFIED', 'Email này đã được xác thực. Vui lòng đăng nhập.');
    }

    const record = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw this.otpError('OTP_EXPIRED', 'Mã xác thực đã hết hạn. Vui lòng bấm "Gửi lại mã".');
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw this.otpError(
        'OTP_TOO_MANY_ATTEMPTS',
        'Bạn đã nhập sai quá nhiều lần. Vui lòng bấm "Gửi lại mã" để nhận mã mới.'
      );
    }

    if (!this.matches(record.codeHash, this.hash(user.id, code))) {
      // Tăng có điều kiện để 2 request song song không vượt quá giới hạn.
      const updated = await this.prisma.emailVerification.updateMany({
        where: { id: record.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - record.attempts - updated.count);
      throw this.otpError(
        remaining > 0 ? 'OTP_INVALID' : 'OTP_TOO_MANY_ATTEMPTS',
        remaining > 0
          ? `Mã xác thực không đúng. Bạn còn ${remaining} lần thử.`
          : 'Bạn đã nhập sai quá nhiều lần. Vui lòng bấm "Gửi lại mã" để nhận mã mới.',
        { remainingAttempts: remaining }
      );
    }

    const [verified] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerification.deleteMany({ where: { userId: user.id } }),
    ]);
    return verified;
  }

  private hash(userId: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`${userId}:${code}`)
      .digest('hex');
  }

  private matches(storedHex: string, candidateHex: string): boolean {
    const a = Buffer.from(storedHex, 'hex');
    const b = Buffer.from(candidateHex, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private otpError(code: string, message: string, extra: Record<string, unknown> = {}) {
    return new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      code,
      message,
      ...extra,
    });
  }
}
