import { CanActivate, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuthTokenService } from '../auth-token.service';

/**
 * ST-036 — Chỉ cho phép route khi AUTH_MODE=local.
 * Khi chạy với Cognito, đăng ký / đăng nhập / OTP / đổi mật khẩu do Cognito đảm nhận,
 * nên các API tự viết này trả 404 để không tồn tại song song 2 cách đăng nhập.
 */
@Injectable()
export class LocalAuthOnlyGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  canActivate(): boolean {
    if (this.tokens.mode !== 'local') {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'LOCAL_AUTH_DISABLED',
        message: 'Chức năng này do Amazon Cognito xử lý khi hệ thống chạy trên AWS.',
      });
    }
    return true;
  }
}
