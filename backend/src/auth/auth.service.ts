import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  BCRYPT_SALT_ROUNDS,
  JwtPayload,
  PublicUser,
  toPublicUser,
} from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { EmailVerificationService } from './email-verification.service';

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

/** Kết quả đăng ký: chưa có token, phải nhập mã OTP gửi qua email trước. */
export interface RegisterResponse {
  requiresVerification: true;
  email: string;
  emailSent: boolean;
  resendAvailableInSec: number;
  message: string;
}

export interface ResendResponse {
  message: string;
  emailSent: boolean;
  resendAvailableInSec: number;
}

const INVALID_CREDENTIALS = 'Email hoặc mật khẩu không đúng.';
const LOCKED_MESSAGE = 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.';

const emailNotVerified = (email: string, message: string) =>
  new ForbiddenException({
    statusCode: HttpStatus.FORBIDDEN,
    error: 'Forbidden',
    code: 'EMAIL_NOT_VERIFIED',
    message,
    email,
  });

@Injectable()
export class AuthService {
  /** Hash giả để so sánh khi email không tồn tại → thời gian phản hồi giống nhau, khó dò email. */
  private readonly dummyHash = bcrypt.hashSync('eventflow-dummy-password', BCRYPT_SALT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly emailVerification: EmailVerificationService
  ) {}

  /**
   * Tạo tài khoản CUSTOMER chưa xác thực và gửi mã OTP. Không trả token —
   * người dùng phải gọi /auth/verify-email với mã trong email mới đăng nhập được.
   */
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (existing) {
      if (!existing.emailVerifiedAt) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email này đã đăng ký nhưng chưa xác thực. Vui lòng nhập mã xác thực.',
          email: dto.email,
        });
      }
      throw new ConflictException('Email này đã được đăng ký.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: 'CUSTOMER', // luôn ép mặc định, client không được chọn role
          status: 'ACTIVE',
          emailVerifiedAt: null,
        },
      });
    } catch (err) {
      // Hai request đăng ký cùng email chạy song song → unique constraint của DB chặn lại.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email này đã được đăng ký.');
      }
      throw err;
    }

    const otp = await this.emailVerification.issue(user);
    return {
      requiresVerification: true,
      email: user.email,
      emailSent: otp.emailSent,
      resendAvailableInSec: otp.resendAvailableInSec,
      message: otp.emailSent
        ? `Đã gửi mã xác thực 6 số tới ${user.email}.`
        : 'Tài khoản đã được tạo nhưng chưa gửi được email. Vui lòng bấm "Gửi lại mã".',
    };
  }

  /** Nhập đúng mã OTP → xác thực email và đăng nhập luôn (trả JWT). */
  async verifyEmail(email: string, code: string): Promise<AuthResponse> {
    const user = await this.emailVerification.verify(email, code);
    if (user.status === 'LOCKED') {
      throw new ForbiddenException(LOCKED_MESSAGE);
    }
    return this.buildAuthResponse(user);
  }

  /** Gửi lại mã. Không tiết lộ email có tồn tại hay không (trả cùng một thông báo). */
  async resendVerification(email: string): Promise<ResendResponse> {
    const generic: ResendResponse = {
      message: 'Nếu email đã đăng ký và chưa xác thực, mã mới đã được gửi.',
      emailSent: true,
      resendAvailableInSec: 60,
    };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt || user.status === 'LOCKED') {
      return generic;
    }
    const otp = await this.emailVerification.issue(user);
    return {
      message: otp.emailSent
        ? `Đã gửi mã xác thực mới tới ${user.email}.`
        : 'Chưa gửi được email. Vui lòng thử lại sau ít phút.',
      emailSent: otp.emailSent,
      resendAvailableInSec: otp.resendAvailableInSec,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !passwordOk) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Chỉ báo "bị khóa" khi đã đúng mật khẩu, tránh lộ trạng thái tài khoản cho người dò.
    if (user.status === 'LOCKED') {
      throw new ForbiddenException(LOCKED_MESSAGE);
    }

    // Chưa xác thực email → chưa cho đăng nhập (Frontend chuyển sang màn nhập mã).
    if (!user.emailVerifiedAt) {
      throw emailNotVerified(
        user.email,
        'Email của bạn chưa được xác thực. Vui lòng nhập mã đã gửi tới email.'
      );
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: toPublicUser(user),
    };
  }
}
