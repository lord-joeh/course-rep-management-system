import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsOptional()
  identifier?: string;

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
