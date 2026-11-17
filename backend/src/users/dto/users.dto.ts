import { Transform } from 'class-transformer';
import { Allow, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * PATCH /api/users/me — chỉ cho sửa name và phone.
 * role / status / email được khai báo @Allow() để ValidationPipe không báo lỗi,
 * nhưng UsersService bỏ qua hoàn toàn các trường này (ST-003: "Bỏ qua hoàn toàn").
 */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự.' })
  @MaxLength(120, { message: 'Họ tên tối đa 120 ký tự.' })
  name?: string;

  /** Gửi chuỗi rỗng "" để xóa số điện thoại. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^$|^\+?[0-9 ]{8,20}$/, { message: 'Số điện thoại không hợp lệ.' })
  phone?: string;

  @Allow() role?: unknown;
  @Allow() status?: unknown;
  @Allow() email?: unknown;
}

/** POST /api/users/me/change-password */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu hiện tại.' })
  @MaxLength(72)
  oldPassword: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' })
  @MaxLength(72, { message: 'Mật khẩu mới tối đa 72 ký tự.' })
  newPassword: string;
}
