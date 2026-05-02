import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[a-z])/, {
    message: 'Password harus mengandung huruf besar, huruf kecil, dan angka',
  })
  newPassword: string;
}
