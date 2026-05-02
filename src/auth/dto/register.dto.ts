import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @IsString()
  @MinLength(2, { message: 'Nama minimal 2 karakter' })
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(64)
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[a-z])/, {
    message: 'Password harus mengandung huruf besar, huruf kecil, dan angka',
  })
  password: string;
}
