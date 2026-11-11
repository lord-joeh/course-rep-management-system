import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsNotEmpty({ message: 'Google ID token is required' })
  @IsString({ message: 'Google ID token must be a string' })
  idToken: string;
}

