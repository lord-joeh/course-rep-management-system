import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class RegisterFcmTokenDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  deviceType?: string;
}
