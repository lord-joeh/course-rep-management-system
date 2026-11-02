import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { Readable } from 'stream';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  SubmitAssignmentDto,
  AssignmentQueryDto,
  StudentSubmissionsQueryDto,
} from './dto';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { PaginationQueryDto } from '../../common/pagination';

describe('AssignmentController', () => {
  let controller: AssignmentController;
  let serviceMock: {
    createAssignment: jest.Mock;
    getAssignmentsByCourse: jest.Mock;
    submitAssignment: jest.Mock;
    getStudentSubmissions: jest.Mock;
    deleteSubmission: jest.Mock;
    downloadSubmissionFile: jest.Mock;
    getAssignmentById: jest.Mock;
    updateAssignment: jest.Mock;
    deleteAssignment: jest.Mock;
    downloadAssignmentFile: jest.Mock;
  };

  const userMock: AuthenticatedUser = {
    id: 'student-uuid-1',
    email: 'student@school.edu',
    name: 'Student Name',
    phone: '1234567890',
    isRep: false,
    role: 'STUDENT',
    status: 'active',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serviceMock = {
      createAssignment: jest.fn(),
      getAssignmentsByCourse: jest.fn(),
      submitAssignment: jest.fn(),
      getStudentSubmissions: jest.fn(),
      deleteSubmission: jest.fn(),
      downloadSubmissionFile: jest.fn(),
      getAssignmentById: jest.fn(),
      updateAssignment: jest.fn(),
      deleteAssignment: jest.fn(),
      downloadAssignmentFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentController],
      providers: [
        {
          provide: AssignmentService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<AssignmentController>(AssignmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createAssignment', () => {
    it('should delegate to assignmentService.createAssignment', async () => {
      const dto: CreateAssignmentDto = {
        title: 'HW1',
        description: 'Details',
        courseId: 'CS101',
        deadline: new Date(Date.now() + 86400000).toISOString(),
      };
      const fileMock = { originalname: 'brief.pdf' } as any;
      const expected = { id: 'ass-1', ...dto };
      serviceMock.createAssignment.mockResolvedValue(expected);

      const result = await controller.createAssignment(dto, fileMock);

      expect(result).toBe(expected);
      expect(serviceMock.createAssignment).toHaveBeenCalledWith(dto, fileMock);
    });
  });

  describe('getAssignmentsByCourse', () => {
    it('should delegate to assignmentService.getAssignmentsByCourse', async () => {
      const query: AssignmentQueryDto = { courseId: 'CS101', page: 1, limit: 10 };
      const expected = { items: [], meta: {} };
      serviceMock.getAssignmentsByCourse.mockResolvedValue(expected);

      const result = await controller.getAssignmentsByCourse(query, userMock);

      expect(result).toBe(expected);
      expect(serviceMock.getAssignmentsByCourse).toHaveBeenCalledWith(query, userMock);
    });
  });

  describe('submitAssignment', () => {
    it('should delegate to assignmentService.submitAssignment with user.id', async () => {
      const dto: SubmitAssignmentDto = { assignmentId: 'ass-1' };
      const fileMock = { originalname: 'solution.zip' } as any;
      const expected = { id: 'sub-1', ...dto };
      serviceMock.submitAssignment.mockResolvedValue(expected);

      const result = await controller.submitAssignment(dto, userMock, fileMock);

      expect(result).toBe(expected);
      expect(serviceMock.submitAssignment).toHaveBeenCalledWith(dto, userMock.id, fileMock);
    });
  });

  describe('getStudentSubmissions', () => {
    it('should delegate to assignmentService.getStudentSubmissions', async () => {
      const query: StudentSubmissionsQueryDto = { assignmentId: 'ass-1', page: 1, limit: 10 };
      const expected = { items: [], meta: {} };
      serviceMock.getStudentSubmissions.mockResolvedValue(expected);

      const result = await controller.getStudentSubmissions('student-1', userMock, query);

      expect(result).toBe(expected);
      expect(serviceMock.getStudentSubmissions).toHaveBeenCalledWith('student-1', userMock, query);
    });
  });

  describe('deleteSubmission', () => {
    it('should delegate to assignmentService.deleteSubmission', async () => {
      const expected = { message: 'Submission successfully deleted' };
      serviceMock.deleteSubmission.mockResolvedValue(expected);

      const result = await controller.deleteSubmission('sub-1', userMock);

      expect(result).toBe(expected);
      expect(serviceMock.deleteSubmission).toHaveBeenCalledWith('sub-1', userMock);
    });
  });

  describe('downloadSubmissionFile', () => {
    it('should pipe download stream to response and set headers', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const resMock = {
        set: jest.fn(),
      } as unknown as Response;

      jest.spyOn(mockStream, 'pipe').mockReturnValue(resMock as any);

      serviceMock.downloadSubmissionFile.mockResolvedValue({
        stream: mockStream,
        fileName: 'my_work.pdf',
        mimeType: 'application/pdf',
        fileSize: '54321',
      });

      await controller.downloadSubmissionFile('sub-1', userMock, resMock);

      expect(serviceMock.downloadSubmissionFile).toHaveBeenCalledWith('sub-1', userMock);
      expect(resMock.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="my_work.pdf"',
      });
      expect(resMock.set).toHaveBeenCalledWith('Content-Length', '54321');
    });

    it('should not set Content-Length header if fileSize is absent', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const resMock = {
        set: jest.fn(),
      } as unknown as Response;

      jest.spyOn(mockStream, 'pipe').mockReturnValue(resMock as any);

      serviceMock.downloadSubmissionFile.mockResolvedValue({
        stream: mockStream,
        fileName: 'my_work.pdf',
        mimeType: 'application/pdf',
      });

      await controller.downloadSubmissionFile('sub-1', userMock, resMock);

      expect(resMock.set).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    });
  });

  describe('getAssignmentById', () => {
    it('should delegate to assignmentService.getAssignmentById', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const expected = { assignment: {}, submissions: {} };
      serviceMock.getAssignmentById.mockResolvedValue(expected);

      const result = await controller.getAssignmentById('ass-1', userMock, query);

      expect(result).toBe(expected);
      expect(serviceMock.getAssignmentById).toHaveBeenCalledWith('ass-1', userMock, query);
    });
  });

  describe('updateAssignment', () => {
    it('should delegate to assignmentService.updateAssignment', async () => {
      const dto: UpdateAssignmentDto = { title: 'Updated' };
      const expected = { id: 'ass-1', title: 'Updated' };
      serviceMock.updateAssignment.mockResolvedValue(expected);

      const result = await controller.updateAssignment('ass-1', dto);

      expect(result).toBe(expected);
      expect(serviceMock.updateAssignment).toHaveBeenCalledWith('ass-1', dto);
    });
  });

  describe('deleteAssignment', () => {
    it('should delegate to assignmentService.deleteAssignment', async () => {
      const expected = { message: 'Deleted' };
      serviceMock.deleteAssignment.mockResolvedValue(expected);

      const result = await controller.deleteAssignment('ass-1');

      expect(result).toBe(expected);
      expect(serviceMock.deleteAssignment).toHaveBeenCalledWith('ass-1');
    });
  });

  describe('downloadAssignmentFile', () => {
    it('should pipe specification stream to response with headers', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const resMock = {
        set: jest.fn(),
      } as unknown as Response;

      jest.spyOn(mockStream, 'pipe').mockReturnValue(resMock as any);

      serviceMock.downloadAssignmentFile.mockResolvedValue({
        stream: mockStream,
        fileName: 'assignment_brief.pdf',
        mimeType: 'application/pdf',
        fileSize: '12345',
      });

      await controller.downloadAssignmentFile('ass-1', resMock);

      expect(serviceMock.downloadAssignmentFile).toHaveBeenCalledWith('ass-1');
      expect(resMock.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="assignment_brief.pdf"',
      });
      expect(resMock.set).toHaveBeenCalledWith('Content-Length', '12345');
    });

    it('should omit Content-Length header if fileSize is absent', async () => {
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });
      const resMock = {
        set: jest.fn(),
      } as unknown as Response;

      jest.spyOn(mockStream, 'pipe').mockReturnValue(resMock as any);

      serviceMock.downloadAssignmentFile.mockResolvedValue({
        stream: mockStream,
        fileName: 'assignment_brief.pdf',
        mimeType: 'application/pdf',
      });

      await controller.downloadAssignmentFile('ass-1', resMock);

      expect(resMock.set).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    });
  });
});

