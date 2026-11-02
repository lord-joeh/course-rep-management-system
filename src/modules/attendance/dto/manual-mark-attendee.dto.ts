import { IsUUID, IsNotEmpty, IsEnum } from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';

export class ManualMarkAttendeeDto {
  @IsUUID()
  @IsNotEmpty()
  attendanceId: string;

  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status: AttendanceStatus;
}

