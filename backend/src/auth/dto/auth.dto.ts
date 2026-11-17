import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /api/auth/register
 * Không có trường role: ValidationPipe (forbidNonWhitelisted) sẽ trả 400 nếu client cố gửi role.
 */
export class RegisterDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự.' })
  @MaxLength(120, { message: 'Họ tên tối đa 120 ký tự.' })
  name: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự.' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự.' })
  password: string;
}

/** POST /api/auth/login */
export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu.' })
  @MaxLength(72)
  password: string;
}
