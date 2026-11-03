import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';

export class DirectNotificationDto {
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsIn(['in_app', 'email', 'sms'])
  messageType?: 'in_app' | 'email' | 'sms';

  @IsOptional()
  @IsString()
  title?: string;
}
