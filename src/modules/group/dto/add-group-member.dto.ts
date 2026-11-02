import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class AddGroupMemberDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsOptional()
  @IsBoolean()
  isLeader?: boolean;
}
