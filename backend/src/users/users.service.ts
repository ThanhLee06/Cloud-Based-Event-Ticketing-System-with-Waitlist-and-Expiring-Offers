import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_SALT_ROUNDS, PublicUser, toPublicUser } from '../auth/auth.types';
import { ChangePasswordDto, UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    return toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    // Chỉ lấy đúng 2 trường được phép; role/status/email trong body bị bỏ qua.
    const data: { name?: string; phone?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone === '' ? null : dto.phone;

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return toPublicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');

    // Trả 400 (không phải 401) để Frontend không hiểu nhầm là hết phiên và tự đá về /login.
    const oldOk = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!oldOk) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    }
    if (dto.newPassword === dto.oldPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Đổi mật khẩu thành công.' };
  }
}
