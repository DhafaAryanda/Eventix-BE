import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Password tidak boleh kosong' })
  password: string;
}
