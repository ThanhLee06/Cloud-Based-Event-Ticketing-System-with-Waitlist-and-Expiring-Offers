import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser, PublicUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LocalAuthOnlyGuard } from '../auth/guards/local-auth-only.guard';
import { ChangePasswordDto, UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

/** ST-003: Hồ sơ cá nhân — mọi vai trò đã đăng nhập đều dùng được. */
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() me: AuthUser): Promise<PublicUser> {
    return this.users.getMe(me.id);
  }

  @Patch()
  updateMe(@CurrentUser() me: AuthUser, @Body() dto: UpdateProfileDto): Promise<PublicUser> {
    return this.users.updateMe(me.id, dto);
  }

  /** Khi dùng Cognito, đổi mật khẩu qua trang "Quên mật khẩu" của Cognito (ST-036). */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthOnlyGuard)
  changePassword(
    @CurrentUser() me: AuthUser,
    @Body() dto: ChangePasswordDto
  ): Promise<{ message: string }> {
    return this.users.changePassword(me.id, dto);
  }
}
