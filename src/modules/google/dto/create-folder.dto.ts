import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty({ message: 'Folder name is required' })
  @Length(1, 100, { message: 'Folder name must be between 1 and 100 characters' })
  folderName: string;

  @IsString()
  @IsOptional()
  parentFolderId?: string;
}

