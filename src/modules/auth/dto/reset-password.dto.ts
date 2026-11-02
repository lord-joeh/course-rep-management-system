import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword: string;
}
