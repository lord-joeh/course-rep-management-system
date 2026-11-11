import { IsOptional, IsString } from 'class-validator';

export class UnregisterFcmTokenDto {
  @IsOptional()
  @IsString()
  token?: string;
}

