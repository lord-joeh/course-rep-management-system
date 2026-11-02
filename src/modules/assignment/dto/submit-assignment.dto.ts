import { IsUUID, IsNotEmpty } from 'class-validator';

export class SubmitAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  assignmentId: string;
}

