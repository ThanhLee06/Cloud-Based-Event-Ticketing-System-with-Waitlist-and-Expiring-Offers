import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthResponse, AuthService, RegisterResponse, ResendResponse } from './auth.service';
import { LoginDto, RegisterDto, ResendVerificationDto, VerifyEmailDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * ST-002: Đăng ký tài khoản Customer mới → gửi mã OTP qua email (chưa trả token).
   * 201 | 400 | 409 (code EMAIL_NOT_VERIFIED nếu email đã đăng ký mà chưa xác thực)
   */
  @Post('register')
  @UseGuards(ThrottlerGuard)
  register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    return this.auth.register(dto);
  }

  /** Xác thực email bằng mã OTP 6 số → trả JWT (đăng nhập luôn). 200 | 400 | 403 | 429 */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponse> {
    return this.auth.verifyEmail(dto.email, dto.code);
  }

  /** Gửi lại mã OTP (chờ 60 giây giữa 2 lần). 200 | 429 */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  resendVerification(@Body() dto: ResendVerificationDto): Promise<ResendResponse> {
    return this.auth.resendVerification(dto.email);
  }

  /**
   * ST-002: Đăng nhập nhận JWT (hạn 24h). 200 | 401 | 403 (bị khóa / EMAIL_NOT_VERIFIED) | 429
   * Giới hạn AUTH_LOGIN_RATE_LIMIT lần/phút/IP (mặc định 10) để chống brute-force.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }
}
