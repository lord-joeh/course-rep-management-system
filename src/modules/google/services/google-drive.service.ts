import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { GoogleAuthService } from './google-auth.service';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
}

export interface DriveDownloadResult {
  stream: Readable;
  fileName: string;
  mimeType: string;
  fileSize?: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(private readonly googleAuthService: GoogleAuthService) {}

  /**
   * Escape user input to prevent Drive Query Injection (CWE-89 / CWE-943).
   */
  escapeDriveQuery(value: string): string {
    if (!value) return '';
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Sanitize filename to prevent HTTP Header Injection / CRLF injection.
   */
  sanitizeFileName(name: string): string {
    if (!name) return 'download';
    // Remove control characters, CRLF, and path separators
    const cleaned = name
      .replace(/[\r\n\0]/g, '')
      .replace(/[\\/]/g, '_')
      .replace(/"/g, "'")
      .trim();
    return cleaned.slice(0, 200) || 'download';
  }

  /**
   * Create a folder in Google Drive.
   */
  async createFolder(
    folderName: string,
    parentFolderId?: string,
  ): Promise<{ id: string; name: string }> {
    if (!folderName || !folderName.trim()) {
      throw new BadRequestException('Folder name is required');
    }

    const auth = await this.googleAuthService.getAuthorizedClient();
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata: drive_v3.Schema$File = {
      name: folderName.trim(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    try {
      const res = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name',
      });

      return {
        id: res.data.id || '',
        name: res.data.name || folderName,
      };
    } catch (err: any) {
      this.logger.error(`Error creating Google Drive folder: ${err.message}`);
      throw new BadRequestException(`Failed to create folder: ${err.message}`);
    }
  }

  /**
   * Stream a file upload directly to Google Drive.
   */
  async uploadFileStream(
    folderId: string,
    fileName: string,
    mimeType: string,
    bodyStream: Readable,
  ): Promise<{ id: string; name: string }> {
    if (!folderId || !folderId.trim()) {
      throw new BadRequestException('Folder ID is required for upload');
    }

    const auth = await this.googleAuthService.getAuthorizedClient();
    const drive = google.drive({ version: 'v3', auth });
    const cleanFileName = this.sanitizeFileName(fileName);

    const fileMetadata: drive_v3.Schema$File = {
      name: cleanFileName,
      parents: [folderId.trim()],
    };

    const media = {
      mimeType: mimeType || 'application/octet-stream',
      body: bodyStream,
    };

    try {
      const res = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, name',
      });

      return {
        id: res.data.id || '',
        name: res.data.name || cleanFileName,
      };
    } catch (err: any) {
      this.logger.error(`Error uploading file "${cleanFileName}" to Drive: ${err.message}`);
      throw new BadRequestException(`Failed to upload file to Google Drive: ${err.message}`);
    }
  }

  /**
   * Injection-Safe Search and List of files in a Drive folder.
   */
  async searchFilesInFolder(folderId: string): Promise<DriveFileItem[]> {
    if (!folderId || !folderId.trim()) {
      throw new BadRequestException('Folder ID is required');
    }

    const auth = await this.googleAuthService.getAuthorizedClient();
    const drive = google.drive({ version: 'v3', auth });
    const allFiles: DriveFileItem[] = [];

    await this.listFilesInFolderRecursively(drive, folderId.trim(), allFiles);
    return allFiles;
  }

  private async listFilesInFolderRecursively(
    drive: drive_v3.Drive,
    folderId: string,
    allFiles: DriveFileItem[],
  ): Promise<void> {
    const escapedFolderId = this.escapeDriveQuery(folderId);
    let pageToken: string | undefined = undefined;

    try {
      do {
        const res: any = await drive.files.list({
          q: `'${escapedFolderId}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)',
          spaces: 'drive',
          pageToken,
          pageSize: 1000,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });

        const files: drive_v3.Schema$File[] = res.data.files || [];
        if (files.length > 0) {
          for (const f of files) {
            allFiles.push({
              id: f.id || '',
              name: f.name || 'unnamed',
              mimeType: f.mimeType || 'application/octet-stream',
              size: f.size || undefined,
              createdTime: f.createdTime || undefined,
            });
          }

          // Recursively query subfolders
          const subfolders = files.filter(
            (file: drive_v3.Schema$File) => file.mimeType === 'application/vnd.google-apps.folder',
          );

          if (subfolders.length > 0) {
            await Promise.all(
              subfolders.map((sf: drive_v3.Schema$File) =>
                sf.id ? this.listFilesInFolderRecursively(drive, sf.id, allFiles) : Promise.resolve(),
              ),
            );
          }
        }

        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
    } catch (err: any) {
      this.logger.error(`Error listing files in folder "${folderId}": ${err.message}`);
      throw new BadRequestException(`Failed to list files in folder: ${err.message}`);
    }
  }

  /**
   * Stream a file download from Google Drive directly to client response.
   */
  async downloadFileStream(fileId: string): Promise<DriveDownloadResult> {
    if (!fileId || !fileId.trim()) {
      throw new BadRequestException('File ID is required');
    }

    const auth = await this.googleAuthService.getAuthorizedClient();
    const drive = google.drive({ version: 'v3', auth });
    const cleanFileId = fileId.trim();

    let meta: any;
    try {
      const metaRes = await drive.files.get({
        fileId: cleanFileId,
        fields: 'id, name, mimeType, size',
      });
      meta = metaRes.data;
    } catch (err: any) {
      this.logger.error(`Failed to fetch file metadata "${cleanFileId}": ${err.message}`);
      throw new NotFoundException(`File with ID "${cleanFileId}" not found on Google Drive`);
    }

    try {
      const mediaRes = await drive.files.get(
        { fileId: cleanFileId, alt: 'media' },
        { responseType: 'stream' },
      );

      return {
        stream: mediaRes.data as Readable,
        fileName: this.sanitizeFileName(meta.name || 'download'),
        mimeType: meta.mimeType || 'application/octet-stream',
        fileSize: meta.size,
      };
    } catch (err: any) {
      this.logger.error(`Error downloading file stream "${cleanFileId}": ${err.message}`);
      throw new BadRequestException(`Failed to download file stream: ${err.message}`);
    }
  }

  /**
   * Delete a file or folder from Google Drive.
   */
  async deleteFile(fileId: string): Promise<{ message: string; fileId: string }> {
    if (!fileId || !fileId.trim()) {
      throw new BadRequestException('File ID is required');
    }

    const auth = await this.googleAuthService.getAuthorizedClient();
    const drive = google.drive({ version: 'v3', auth });
    const cleanFileId = fileId.trim();

    try {
      await drive.files.delete({ fileId: cleanFileId });
      return {
        message: `File "${cleanFileId}" successfully deleted from Google Drive`,
        fileId: cleanFileId,
      };
    } catch (err: any) {
      this.logger.error(`Error deleting file "${cleanFileId}": ${err.message}`);
      throw new BadRequestException(`Failed to delete file: ${err.message}`);
    }
  }
}
