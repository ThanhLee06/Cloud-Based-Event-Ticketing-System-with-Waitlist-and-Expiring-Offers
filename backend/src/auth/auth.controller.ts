import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthResponse, AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** ST-002: Đăng ký tài khoản Customer mới. 201 | 400 | 409 */
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  /**
   * ST-002: Đăng nhập nhận JWT (hạn 24h). 200 | 401 | 403 | 429
   * Giới hạn AUTH_LOGIN_RATE_LIMIT lần/phút/IP (mặc định 10) để chống brute-force.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }
}
