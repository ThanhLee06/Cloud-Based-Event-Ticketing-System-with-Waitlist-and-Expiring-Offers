import { UserRole, UserStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** GET /api/admin/users?role=&status=&q=&page=&pageSize= */
export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole, { message: 'role phải là CUSTOMER, ORGANIZER hoặc ADMIN.' })
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'status phải là ACTIVE hoặc LOCKED.' })
  status?: UserStatus;

  /** Tìm theo email hoặc tên (không phân biệt hoa thường). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

/** PATCH /api/admin/users/:id/role */
export class UpdateUserRoleDto {
  @IsEnum(UserRole, { message: 'role phải là CUSTOMER, ORGANIZER hoặc ADMIN.' })
  role: UserRole;
}

/** PATCH /api/admin/users/:id/status */
export class UpdateUserStatusDto {
  @IsEnum(UserStatus, { message: "status phải là 'ACTIVE' hoặc 'LOCKED'." })
  status: UserStatus;
}
