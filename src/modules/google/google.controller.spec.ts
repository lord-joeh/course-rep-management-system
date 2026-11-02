import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { Readable } from 'stream';

import { GoogleController } from './google.controller';
import { GoogleAuthService } from './services/google-auth.service';
import { GoogleDriveService } from './services/google-drive.service';
import { CreateFolderDto } from './dto';

describe('GoogleController', () => {
  let controller: GoogleController;
  let googleAuthServiceMock: {
    generateAuthUrl: jest.Mock;
    handleCallback: jest.Mock;
    getStatus: jest.Mock;
    revokeAccess: jest.Mock;
  };
  let googleDriveServiceMock: {
    createFolder: jest.Mock;
    searchFilesInFolder: jest.Mock;
    downloadFileStream: jest.Mock;
    deleteFile: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    googleAuthServiceMock = {
      generateAuthUrl: jest.fn(),
      handleCallback: jest.fn(),
      getStatus: jest.fn(),
      revokeAccess: jest.fn(),
    };

    googleDriveServiceMock = {
      createFolder: jest.fn(),
      searchFilesInFolder: jest.fn(),
      downloadFileStream: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleController],
      providers: [
        {
          provide: GoogleAuthService,
          useValue: googleAuthServiceMock,
        },
        {
          provide: GoogleDriveService,
          useValue: googleDriveServiceMock,
        },
      ],
    }).compile();

    controller = module.get<GoogleController>(GoogleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAuthUrl', () => {
    it('should delegate to googleAuthService.generateAuthUrl with repId', async () => {
      const mockResult = {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        state: 'random_state',
      };
      googleAuthServiceMock.generateAuthUrl.mockResolvedValue(mockResult);

      const result = await controller.getAuthUrl('rep_123');

      expect(result).toBe(mockResult);
      expect(googleAuthServiceMock.generateAuthUrl).toHaveBeenCalledWith('rep_123');
    });
  });

  describe('callback', () => {
    it('should delegate to googleAuthService.handleCallback with code and state', async () => {
      const mockResult = {
        message: 'Google account connected successfully',
        connected: true,
      };
      googleAuthServiceMock.handleCallback.mockResolvedValue(mockResult);

      const result = await controller.callback('auth_code_xyz', 'auth_state_abc');

      expect(result).toBe(mockResult);
      expect(googleAuthServiceMock.handleCallback).toHaveBeenCalledWith(
        'auth_code_xyz',
        'auth_state_abc',
      );
    });
  });

  describe('getStatus', () => {
    it('should delegate to googleAuthService.getStatus', async () => {
      const mockStatus = { connected: true, expiryDate: 1730000000000 };
      googleAuthServiceMock.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus();

      expect(result).toBe(mockStatus);
      expect(googleAuthServiceMock.getStatus).toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('should delegate to googleAuthService.revokeAccess', async () => {
      const mockRevoke = { message: 'Google account disconnected successfully' };
      googleAuthServiceMock.revokeAccess.mockResolvedValue(mockRevoke);

      const result = await controller.revoke();

      expect(result).toBe(mockRevoke);
      expect(googleAuthServiceMock.revokeAccess).toHaveBeenCalled();
    });
  });

  describe('createFolder', () => {
    it('should delegate to googleDriveService.createFolder', async () => {
      const dto: CreateFolderDto = {
        folderName: 'CS 101 Materials',
        parentFolderId: 'parent_folder_id',
      };
      const mockResult = { id: 'new_folder_id', name: 'CS 101 Materials' };
      googleDriveServiceMock.createFolder.mockResolvedValue(mockResult);

      const result = await controller.createFolder(dto);

      expect(result).toBe(mockResult);
      expect(googleDriveServiceMock.createFolder).toHaveBeenCalledWith(
        'CS 101 Materials',
        'parent_folder_id',
      );
    });
  });

  describe('listFilesInFolder', () => {
    it('should delegate to googleDriveService.searchFilesInFolder', async () => {
      const mockFiles = [
        { id: 'f1', name: 'Lecture1.pdf', mimeType: 'application/pdf' },
      ];
      googleDriveServiceMock.searchFilesInFolder.mockResolvedValue(mockFiles);

      const result = await controller.listFilesInFolder('folder_123');

      expect(result).toBe(mockFiles);
      expect(googleDriveServiceMock.searchFilesInFolder).toHaveBeenCalledWith('folder_123');
    });
  });

  describe('downloadFile', () => {
    it('should stream file download with Content-Type, Content-Disposition, and Content-Length headers', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const pipeSpy = jest.spyOn(mockStream, 'pipe').mockReturnValue(mockStream as any);

      googleDriveServiceMock.downloadFileStream.mockResolvedValue({
        stream: mockStream,
        fileName: 'Syllabus.pdf',
        mimeType: 'application/pdf',
        fileSize: '54321',
      });

      const resMock = {
        setHeader: jest.fn(),
      } as unknown as Response;

      await controller.downloadFile('file_999', resMock);

      expect(googleDriveServiceMock.downloadFileStream).toHaveBeenCalledWith('file_999');
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(resMock.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="Syllabus.pdf"',
      );
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Length', '54321');
      expect(pipeSpy).toHaveBeenCalledWith(resMock);
    });

    it('should omit Content-Length header if fileSize is not provided', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      jest.spyOn(mockStream, 'pipe').mockReturnValue(mockStream as any);

      googleDriveServiceMock.downloadFileStream.mockResolvedValue({
        stream: mockStream,
        fileName: 'Unknown.bin',
        mimeType: 'application/octet-stream',
        fileSize: undefined,
      });

      const resMock = {
        setHeader: jest.fn(),
      } as unknown as Response;

      await controller.downloadFile('file_unknown', resMock);

      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
      expect(resMock.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="Unknown.bin"',
      );
      expect(resMock.setHeader).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    });
  });

  describe('deleteFile', () => {
    it('should delegate to googleDriveService.deleteFile', async () => {
      const mockResult = {
        message: 'File "file_xyz" successfully deleted from Google Drive',
        fileId: 'file_xyz',
      };
      googleDriveServiceMock.deleteFile.mockResolvedValue(mockResult);

      const result = await controller.deleteFile('file_xyz');

      expect(result).toBe(mockResult);
      expect(googleDriveServiceMock.deleteFile).toHaveBeenCalledWith('file_xyz');
    });
  });
});

