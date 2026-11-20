import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * TV1 — AuthModule (ST-002, ST-004).
 * @Global để các module khác (Events, Reservations, Waitlist, Organizer, Admin...) dùng ngay:
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('ORGANIZER')
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Chỉ áp dụng cho route có @UseGuards(ThrottlerGuard): login, register, verify-email,
        // resend-verification — mỗi route đếm riêng theo IP.
        throttlers: [
          { name: 'login', ttl: 60_000, limit: config.get<number>('AUTH_LOGIN_RATE_LIMIT') ?? 10 },
        ],
        errorMessage: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau 1 phút.',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailVerificationService, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
})
export class AuthModule {}
