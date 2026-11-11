import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { Readable } from 'stream';

import { SlideController } from './slide.controller';
import { SlideService } from './slide.service';
import { UploadSlideDto, SlideQueryDto } from './dto';

describe('SlideController', () => {
  let controller: SlideController;
  let slideServiceMock: {
    uploadSlides: jest.Mock;
    findSlidesByCourse: jest.Mock;
    searchFilesInFolder: jest.Mock;
    downloadSlideStream: jest.Mock;
    deleteSlide: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    slideServiceMock = {
      uploadSlides: jest.fn(),
      findSlidesByCourse: jest.fn(),
      searchFilesInFolder: jest.fn(),
      downloadSlideStream: jest.fn(),
      deleteSlide: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlideController],
      providers: [
        {
          provide: SlideService,
          useValue: slideServiceMock,
        },
      ],
    }).compile();

    controller = module.get<SlideController>(SlideController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadSlides', () => {
    it('should delegate to slideService.uploadSlides with files and dto parameters', async () => {
      const mockFiles: Express.Multer.File[] = [
        { originalname: 'Syllabus.pdf' } as any,
      ];
      const dto: UploadSlideDto = { courseId: 'CS101', folderId: 'folder_abc' };
      const mockResponse = { uploaded: [], duplicatesSkipped: [], failed: [] };
      slideServiceMock.uploadSlides.mockResolvedValue(mockResponse);

      const result = await controller.uploadSlides(mockFiles, dto, 'user-uploader-1');

      expect(result).toBe(mockResponse);
      expect(slideServiceMock.uploadSlides).toHaveBeenCalledWith(
        mockFiles,
        'CS101',
        'folder_abc',
        'user-uploader-1',
      );
    });
  });

  describe('getSlidesByCourse', () => {
    it('should delegate to slideService.findSlidesByCourse with query', async () => {
      const query: SlideQueryDto = { courseId: 'CS101', page: 1, limit: 10, search: 'notes' };
      const mockResult = { items: [], meta: { page: 1, limit: 10, total: 0 } };
      slideServiceMock.findSlidesByCourse.mockResolvedValue(mockResult);

      const result = await controller.getSlidesByCourse(query);

      expect(result).toBe(mockResult);
      expect(slideServiceMock.findSlidesByCourse).toHaveBeenCalledWith(query);
    });
  });

  describe('searchFilesInFolder', () => {
    it('should delegate to slideService.searchFilesInFolder with folderId', async () => {
      const mockFiles = [{ id: 'f1', name: 'Slide.pdf' }];
      slideServiceMock.searchFilesInFolder.mockResolvedValue(mockFiles);

      const result = await controller.searchFilesInFolder('folder_123');

      expect(result).toBe(mockFiles);
      expect(slideServiceMock.searchFilesInFolder).toHaveBeenCalledWith('folder_123');
    });
  });

  describe('downloadSlide', () => {
    it('should stream slide with Content-Type, Content-Disposition, and Content-Length headers', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const resMock = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const pipeSpy = jest.spyOn(mockStream, 'pipe').mockReturnValue(resMock as any);

      slideServiceMock.downloadSlideStream.mockResolvedValue({
        stream: mockStream,
        fileName: 'Lecture1.pdf',
        mimeType: 'application/pdf',
        fileSize: '98765',
      });

      await controller.downloadSlide('00000000-0000-0000-0000-000000000001', resMock);

      expect(slideServiceMock.downloadSlideStream).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
      );
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(resMock.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="Lecture1.pdf"',
      );
      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Length', '98765');
      expect(pipeSpy).toHaveBeenCalledWith(resMock);
    });

    it('should omit Content-Length header if fileSize is undefined', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const resMock = {
        setHeader: jest.fn(),
      } as unknown as Response;

      jest.spyOn(mockStream, 'pipe').mockReturnValue(resMock as any);

      slideServiceMock.downloadSlideStream.mockResolvedValue({
        stream: mockStream,
        fileName: 'Lecture2.pdf',
        mimeType: 'application/pdf',
        fileSize: undefined,
      });

      await controller.downloadSlide('00000000-0000-0000-0000-000000000002', resMock);

      expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(resMock.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="Lecture2.pdf"',
      );
      expect(resMock.setHeader).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    });
  });

  describe('deleteSlide', () => {
    it('should delegate to slideService.deleteSlide with slideId', async () => {
      const mockResult = { message: 'Slide deleted successfully', slideId: 'slide_123' };
      slideServiceMock.deleteSlide.mockResolvedValue(mockResult);

      const result = await controller.deleteSlide('00000000-0000-0000-0000-000000000003');

      expect(result).toBe(mockResult);
      expect(slideServiceMock.deleteSlide).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000003',
      );
    });
  });
});
