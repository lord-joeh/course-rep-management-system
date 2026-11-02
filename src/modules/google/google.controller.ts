import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './services/google-auth.service';
import { GoogleDriveService } from './services/google-drive.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateFolderDto } from './dto';

@Controller('google')
export class GoogleController {
  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  /**
   * Initiate Google OAuth2 authorization flow.
   * Course Rep only.
   */
  @Get('auth-url')
  @Roles(UserRole.REP)
  async getAuthUrl(@CurrentUser('id') repId: string) {
    return this.googleAuthService.generateAuthUrl(repId);
  }

  /**
   * Google OAuth2 callback endpoint.
   * Public (handles Google redirect).
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.googleAuthService.handleCallback(code, state);
  }

  /**
   * Check connection and token status.
   * Course Rep only.
   */
  @Get('status')
  @Roles(UserRole.REP)
  async getStatus() {
    return this.googleAuthService.getStatus();
  }

  /**
   * Disconnect Google account and revoke access.
   * Course Rep only.
   */
  @Post('revoke')
  @Roles(UserRole.REP)
  @HttpCode(HttpStatus.OK)
  async revoke() {
    return this.googleAuthService.revokeAccess();
  }

  /**
   * Create a new folder on Google Drive.
   * Course Rep only.
   */
  @Post('folders')
  @Roles(UserRole.REP)
  async createFolder(@Body() dto: CreateFolderDto) {
    return this.googleDriveService.createFolder(
      dto.folderName,
      dto.parentFolderId,
    );
  }

  /**
   * Search and list files within a Drive folder.
   * Accessible by all authenticated students and reps.
   */
  @Get('folders/:folderId/files')
  async listFilesInFolder(@Param('folderId') folderId: string) {
    return this.googleDriveService.searchFilesInFolder(folderId);
  }

  /**
   * Stream a file download from Google Drive to the client.
   * Accessible by all authenticated students and reps.
   */
  @Get('files/:fileId/download')
  async downloadFile(
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { stream, fileName, mimeType, fileSize } =
      await this.googleDriveService.downloadFileStream(fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );

    if (fileSize) {
      res.setHeader('Content-Length', fileSize);
    }

    stream.pipe(res);
  }

  /**
   * Delete a file or folder from Google Drive.
   * Course Rep only.
   */
  @Delete('files/:fileId')
  @Roles(UserRole.REP)
  async deleteFile(@Param('fileId') fileId: string) {
    return this.googleDriveService.deleteFile(fileId);
  }
}

