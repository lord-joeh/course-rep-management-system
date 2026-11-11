import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CompleteOAuthRegistrationDto {
  @IsNotEmpty({ message: 'Temporary onboarding token is required' })
  @IsString()
  tempToken: string;

  @IsNotEmpty({ message: 'Student ID / Index number is required' })
  @Length(4, 50, { message: 'Student ID must be between 4 and 50 characters' })
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Student ID must only contain letters, numbers, hyphens, and underscores',
  })
  studentId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

