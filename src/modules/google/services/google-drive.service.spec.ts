import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { google } from 'googleapis';
import { Readable } from 'stream';

import { GoogleDriveService } from './google-drive.service';
import { GoogleAuthService } from './google-auth.service';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let googleAuthServiceMock: {
    getAuthorizedClient: jest.Mock;
  };

  const mockDriveFiles = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    googleAuthServiceMock = {
      getAuthorizedClient: jest.fn().mockResolvedValue({}),
    };

    jest.spyOn(google, 'drive').mockReturnValue({
      files: mockDriveFiles,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleDriveService,
        {
          provide: GoogleAuthService,
          useValue: googleAuthServiceMock,
        },
      ],
    }).compile();

    service = module.get<GoogleDriveService>(GoogleDriveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('escapeDriveQuery', () => {
    it('should return empty string if input is falsy', () => {
      expect(service.escapeDriveQuery('')).toBe('');
      expect(service.escapeDriveQuery(null as any)).toBe('');
    });

    it('should escape backslashes and single quotes to prevent injection', () => {
      const malicious = "folder\\' or 1=1 --";
      const escaped = service.escapeDriveQuery(malicious);
      expect(escaped).toBe("folder\\\\\\' or 1=1 --");
    });
  });

  describe('sanitizeFileName', () => {
    it('should return default filename for empty or falsy name', () => {
      expect(service.sanitizeFileName('')).toBe('download');
      expect(service.sanitizeFileName(null as any)).toBe('download');
    });

    it('should strip CRLF, null bytes, double quotes, and path separators', () => {
      const dirty = '\r\n../dangerous/"file"\0.pdf';
      const clean = service.sanitizeFileName(dirty);
      expect(clean).toBe('.._dangerous_\'file\'.pdf');
    });

    it('should return download if cleaned string is empty', () => {
      expect(service.sanitizeFileName('   \r\n\0   ')).toBe('download');
    });

    it('should truncate excessively long file names to 200 chars', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const clean = service.sanitizeFileName(longName);
      expect(clean.length).toBe(200);
    });
  });

  describe('createFolder', () => {
    it('should throw BadRequestException if folderName is empty', async () => {
      await expect(service.createFolder('   ')).rejects.toThrow(BadRequestException);
    });

    it('should create folder successfully at root when no parentFolderId', async () => {
      mockDriveFiles.create.mockResolvedValue({
        data: { id: 'folder_abc123', name: 'Course Materials' },
      });

      const result = await service.createFolder('Course Materials');

      expect(result).toEqual({ id: 'folder_abc123', name: 'Course Materials' });
      expect(mockDriveFiles.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'Course Materials',
          mimeType: 'application/vnd.google-apps.folder',
          parents: undefined,
        },
        fields: 'id, name',
      });
    });

    it('should create folder successfully inside parent folder', async () => {
      mockDriveFiles.create.mockResolvedValue({
        data: { id: 'child_xyz', name: 'Week 1' },
      });

      const result = await service.createFolder('Week 1', 'parent_123');

      expect(result).toEqual({ id: 'child_xyz', name: 'Week 1' });
      expect(mockDriveFiles.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'Week 1',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['parent_123'],
        },
        fields: 'id, name',
      });
    });

    it('should fallback to defaults if create response has empty id and name', async () => {
      mockDriveFiles.create.mockResolvedValue({
        data: { id: null, name: null },
      });

      const result = await service.createFolder('Fallback Folder');
      expect(result).toEqual({ id: '', name: 'Fallback Folder' });
    });

    it('should throw BadRequestException if Drive API fails', async () => {
      mockDriveFiles.create.mockRejectedValue(new Error('Quota exceeded'));

      await expect(service.createFolder('New Folder')).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadFileStream', () => {
    it('should throw BadRequestException if folderId is empty', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      await expect(
        service.uploadFileStream('   ', 'slide1.pdf', 'application/pdf', mockStream),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload stream to Drive and return id and sanitized name', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      mockDriveFiles.create.mockResolvedValue({
        data: { id: 'drive_file_999', name: 'clean_slide.pdf' },
      });

      const result = await service.uploadFileStream(
        'folder_123',
        'dirty/slide.pdf',
        'application/pdf',
        mockStream,
      );

      expect(result).toEqual({ id: 'drive_file_999', name: 'clean_slide.pdf' });
      expect(mockDriveFiles.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'dirty_slide.pdf',
          parents: ['folder_123'],
        },
        media: {
          mimeType: 'application/pdf',
          body: mockStream,
        },
        fields: 'id, name',
      });
    });

    it('should fallback to cleanFileName and default mimeType if omitted or null in response', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      mockDriveFiles.create.mockResolvedValue({
        data: { id: null, name: null },
      });

      const result = await service.uploadFileStream(
        'folder_123',
        'notes.txt',
        '',
        mockStream,
      );

      expect(result).toEqual({ id: '', name: 'notes.txt' });
      expect(mockDriveFiles.create).toHaveBeenCalledWith(
        expect.objectContaining({
          media: {
            mimeType: 'application/octet-stream',
            body: mockStream,
          },
        }),
      );
    });

    it('should throw BadRequestException if Drive API throws error', async () => {
      const mockStream = new Readable({ read() { this.push(null); } });
      mockDriveFiles.create.mockRejectedValue(new Error('Drive network failure'));

      await expect(
        service.uploadFileStream('folder_123', 'notes.txt', 'text/plain', mockStream),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('searchFilesInFolder', () => {
    it('should throw BadRequestException if folderId is empty', async () => {
      await expect(service.searchFilesInFolder('')).rejects.toThrow(BadRequestException);
    });

    it('should list files in folder and recursively traverse subfolders', async () => {
      // First call for parent folder returns 1 file and 1 subfolder
      mockDriveFiles.list
        .mockResolvedValueOnce({
          data: {
            files: [
              {
                id: 'file_1',
                name: 'Syllabus.pdf',
                mimeType: 'application/pdf',
                size: '1024',
                createdTime: '2026-01-01T00:00:00Z',
              },
              {
                id: 'subfolder_1',
                name: 'Lectures',
                mimeType: 'application/vnd.google-apps.folder',
              },
            ],
            nextPageToken: null,
          },
        })
        // Second call for subfolder returns 1 child file
        .mockResolvedValueOnce({
          data: {
            files: [
              {
                id: 'file_2',
                name: 'Lecture1.pptx',
                mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                size: '2048',
                createdTime: '2026-01-02T00:00:00Z',
              },
            ],
            nextPageToken: null,
          },
        });

      const files = await service.searchFilesInFolder('parent_folder_id');

      expect(files).toHaveLength(3);
      expect(files[0].id).toBe('file_1');
      expect(files[1].id).toBe('subfolder_1');
      expect(files[2].id).toBe('file_2');
      expect(mockDriveFiles.list).toHaveBeenCalledTimes(2);
    });

    it('should handle pagination with nextPageToken', async () => {
      mockDriveFiles.list
        .mockResolvedValueOnce({
          data: {
            files: [{ id: 'p1_f1', name: 'File1.txt' }],
            nextPageToken: 'token_page_2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            files: [{ id: 'p2_f2', name: 'File2.txt' }],
            nextPageToken: null,
          },
        });

      const files = await service.searchFilesInFolder('folder_id');

      expect(files).toHaveLength(2);
      expect(files[0].id).toBe('p1_f1');
      expect(files[1].id).toBe('p2_f2');
      expect(mockDriveFiles.list).toHaveBeenCalledTimes(2);
    });

    it('should handle missing files array and file objects with missing fields', async () => {
      mockDriveFiles.list.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: null,
              name: null,
              mimeType: null,
              size: null,
              createdTime: null,
            },
            {
              id: null,
              mimeType: 'application/vnd.google-apps.folder',
            },
          ],
        },
      });

      const files = await service.searchFilesInFolder('folder_missing_fields');
      expect(files).toHaveLength(2);
      expect(files[0].id).toBe('');
      expect(files[0].name).toBe('unnamed');
      expect(files[0].mimeType).toBe('application/octet-stream');
      expect(files[0].size).toBeUndefined();
      expect(files[0].createdTime).toBeUndefined();
    });

    it('should handle completely missing res.data.files', async () => {
      mockDriveFiles.list.mockResolvedValueOnce({
        data: {
          files: null,
        },
      });

      const files = await service.searchFilesInFolder('empty_folder');
      expect(files).toHaveLength(0);
    });

    it('should throw BadRequestException if drive.files.list throws', async () => {
      mockDriveFiles.list.mockRejectedValue(new Error('Permission denied'));

      await expect(service.searchFilesInFolder('forbidden_folder')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('downloadFileStream', () => {
    it('should throw BadRequestException if fileId is empty', async () => {
      await expect(service.downloadFileStream('')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if file metadata retrieval fails', async () => {
      mockDriveFiles.get.mockRejectedValue(new Error('File not found'));

      await expect(service.downloadFileStream('non_existent_id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return readable stream, sanitized filename, and mime type on success', async () => {
      const mockStream = new Readable({
        read() {
          this.push(Buffer.from('hello file stream'));
          this.push(null);
        },
      });

      // Metadata call
      mockDriveFiles.get.mockResolvedValueOnce({
        data: {
          id: 'file_123',
          name: 'Lecture Notes "Draft".pdf',
          mimeType: 'application/pdf',
          size: '12345',
        },
      });

      // Media call
      mockDriveFiles.get.mockResolvedValueOnce({
        data: mockStream,
      });

      const result = await service.downloadFileStream('file_123');

      expect(result).toBeDefined();
      expect(result.stream).toBe(mockStream);
      expect(result.fileName).toBe("Lecture Notes 'Draft'.pdf");
      expect(result.mimeType).toBe('application/pdf');
      expect(result.fileSize).toBe('12345');
    });

    it('should fallback to default filename and mimeType if metadata fields are null', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      mockDriveFiles.get.mockResolvedValueOnce({
        data: {
          id: 'file_fallback',
          name: null,
          mimeType: null,
          size: null,
        },
      });

      mockDriveFiles.get.mockResolvedValueOnce({
        data: mockStream,
      });

      const result = await service.downloadFileStream('file_fallback');
      expect(result.fileName).toBe('download');
      expect(result.mimeType).toBe('application/octet-stream');
      expect(result.fileSize).toBeNull();
    });

    it('should throw BadRequestException if media stream retrieval fails', async () => {
      mockDriveFiles.get
        .mockResolvedValueOnce({
          data: { id: 'file_123', name: 'notes.pdf' },
        })
        .mockRejectedValueOnce(new Error('Media download aborted'));

      await expect(service.downloadFileStream('file_123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteFile', () => {
    it('should throw BadRequestException if fileId is empty', async () => {
      await expect(service.deleteFile('')).rejects.toThrow(BadRequestException);
    });

    it('should delete file successfully and return confirmation', async () => {
      mockDriveFiles.delete.mockResolvedValue({});

      const result = await service.deleteFile('file_to_del');

      expect(result).toEqual({
        message: 'File "file_to_del" successfully deleted from Google Drive',
        fileId: 'file_to_del',
      });
      expect(mockDriveFiles.delete).toHaveBeenCalledWith({ fileId: 'file_to_del' });
    });

    it('should throw BadRequestException if drive.files.delete throws', async () => {
      mockDriveFiles.delete.mockRejectedValue(new Error('Not found'));

      await expect(service.deleteFile('bad_file')).rejects.toThrow(BadRequestException);
    });
  });
});

