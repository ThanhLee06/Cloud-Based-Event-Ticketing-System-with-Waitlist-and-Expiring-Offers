import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthResponse, AuthService, RegisterResponse, ResendResponse } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import type { PublicUser } from './auth.types';
import { CognitoSessionService } from './cognito-session.service';
import {
  CognitoSessionDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { LocalAuthOnlyGuard } from './guards/local-auth-only.guard';

/** Cấu hình đăng nhập công khai cho Frontend (không chứa bí mật). */
export interface AuthConfigResponse {
  mode: 'local' | 'cognito';
  cognito: { domain: string; clientId: string; region: string } | null;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: AuthTokenService,
    private readonly cognitoSession: CognitoSessionService,
    private readonly config: ConfigService
  ) {}

  /**
   * ST-036: Frontend hỏi đang dùng cách đăng nhập nào. Nhờ vậy cùng một bản đóng gói giao diện
   * chạy được cả local lẫn AWS mà không phải build lại khi đổi User Pool.
   */
  @Get('config')
  getConfig(): AuthConfigResponse {
    if (this.tokens.mode !== 'cognito') {
      return { mode: 'local', cognito: null };
    }
    return {
      mode: 'cognito',
      cognito: {
        domain: this.config.getOrThrow<string>('COGNITO_DOMAIN'),
        clientId: this.config.getOrThrow<string>('COGNITO_CLIENT_ID'),
        region: this.config.getOrThrow<string>('COGNITO_REGION'),
      },
    };
  }

  /**
   * ST-036: Sau khi đăng nhập Cognito, gửi ID token để liên kết / tạo user EventFlow.
   * 200 | 401 (token sai/hết hạn) | 403 (email chưa xác thực / bị khóa) | 404 (đang ở chế độ local) | 409
   */
  @Post('cognito/session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async cognitoSessionLink(@Body() dto: CognitoSessionDto): Promise<{ user: PublicUser }> {
    if (this.tokens.mode !== 'cognito') {
      throw new NotFoundException('Hệ thống đang dùng đăng nhập local.');
    }
    return { user: await this.cognitoSession.link(dto.idToken) };
  }

  /**
   * ST-002: Đăng ký tài khoản Customer mới → gửi mã OTP qua email (chưa trả token).
   * 201 | 400 | 409 (code EMAIL_NOT_VERIFIED nếu email đã đăng ký mà chưa xác thực)
   */
  @Post('register')
  @UseGuards(LocalAuthOnlyGuard, ThrottlerGuard)
  register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    return this.auth.register(dto);
  }

  /** Xác thực email bằng mã OTP 6 số → trả JWT (đăng nhập luôn). 200 | 400 | 403 | 429 */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthOnlyGuard, ThrottlerGuard)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponse> {
    return this.auth.verifyEmail(dto.email, dto.code);
  }

  /** Gửi lại mã OTP (chờ 60 giây giữa 2 lần). 200 | 429 */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthOnlyGuard, ThrottlerGuard)
  resendVerification(@Body() dto: ResendVerificationDto): Promise<ResendResponse> {
    return this.auth.resendVerification(dto.email);
  }

  /**
   * ST-002: Đăng nhập nhận JWT (hạn 24h). 200 | 401 | 403 (bị khóa / EMAIL_NOT_VERIFIED) | 429
   * Giới hạn AUTH_LOGIN_RATE_LIMIT lần/phút/IP (mặc định 10) để chống brute-force.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthOnlyGuard, ThrottlerGuard)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }
}
