import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Khai báo các vai trò được phép gọi route. Dùng kèm JwtAuthGuard + RolesGuard:
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('ORGANIZER', 'ADMIN')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
