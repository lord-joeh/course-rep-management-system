import { IsString, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Email or Student ID is required' })
  identifier: string;
}
