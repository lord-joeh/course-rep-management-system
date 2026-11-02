import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import {
  CreateFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto';
import {
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
} from './entities/feedback.entity';
import { UserRole } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { PaginationQueryDto } from '../../common/pagination';

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let serviceMock: {
    createFeedback: jest.Mock;
    getFeedbacks: jest.Mock;
    getMyFeedbacks: jest.Mock;
    getFeedbackById: jest.Mock;
    updateStatus: jest.Mock;
    deleteFeedback: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'student@example.com',
    name: 'Sample Student',
    phone: '+233200000001',
    role: UserRole.STUDENT,
    isRep: false,
    status: 'ACTIVE',
  };

  const mockRepUser: AuthenticatedUser = {
    id: 'rep-uuid-1',
    email: 'rep@example.com',
    name: 'Sample Rep',
    phone: '+233200000002',
    role: UserRole.REP,
    isRep: true,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serviceMock = {
      createFeedback: jest.fn(),
      getFeedbacks: jest.fn(),
      getMyFeedbacks: jest.fn(),
      getFeedbackById: jest.fn(),
      updateStatus: jest.fn(),
      deleteFeedback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [
        {
          provide: FeedbackService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<FeedbackController>(FeedbackController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createFeedback', () => {
    it('should delegate to service.createFeedback with user.id and dto', async () => {
      const dto: CreateFeedbackDto = {
        title: 'Broken projector in Lab 2',
        content: 'The HDMI cable is torn and the display flickers.',
        category: FeedbackCategory.FACILITIES,
        priority: FeedbackPriority.HIGH,
        isAnonymous: false,
      };

      const expected = { id: 'fb-1', ...dto, studentId: mockUser.id };
      serviceMock.createFeedback.mockResolvedValue(expected);

      const result = await controller.createFeedback(mockUser, dto);

      expect(serviceMock.createFeedback).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getFeedbacks', () => {
    it('should delegate to service.getFeedbacks with query dto', async () => {
      const query: FeedbackQueryDto = {
        page: 1,
        limit: 10,
        status: FeedbackStatus.SUBMITTED,
      };

      const expected = {
        items: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      serviceMock.getFeedbacks.mockResolvedValue(expected);

      const result = await controller.getFeedbacks(query);

      expect(serviceMock.getFeedbacks).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });
  });

  describe('getMyFeedbacks', () => {
    it('should delegate to service.getMyFeedbacks with user.id and pagination', async () => {
      const query: PaginationQueryDto = {
        page: 2,
        limit: 15,
      };

      const expected = {
        items: [],
        meta: {
          total: 0,
          page: 2,
          limit: 15,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      };
      serviceMock.getMyFeedbacks.mockResolvedValue(expected);

      const result = await controller.getMyFeedbacks(mockUser, query);

      expect(serviceMock.getMyFeedbacks).toHaveBeenCalledWith(
        mockUser.id,
        2,
        15,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getFeedbackById', () => {
    it('should delegate to service.getFeedbackById with id and user', async () => {
      const expected = { id: 'fb-123', title: 'Issue with sound' };
      serviceMock.getFeedbackById.mockResolvedValue(expected);

      const result = await controller.getFeedbackById('fb-123', mockUser);

      expect(serviceMock.getFeedbackById).toHaveBeenCalledWith(
        'fb-123',
        mockUser,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('updateStatus', () => {
    it('should delegate to service.updateStatus with id, rep.id, and dto', async () => {
      const dto: UpdateFeedbackStatusDto = {
        status: FeedbackStatus.RESOLVED,
        repResponse: 'Projector cable replaced by IT department.',
      };

      const expected = { id: 'fb-123', ...dto, respondedBy: mockRepUser.id };
      serviceMock.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus(
        'fb-123',
        mockRepUser,
        dto,
      );

      expect(serviceMock.updateStatus).toHaveBeenCalledWith(
        'fb-123',
        mockRepUser.id,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('deleteFeedback', () => {
    it('should delegate to service.deleteFeedback with id', async () => {
      const expected = { message: 'Feedback successfully deleted' };
      serviceMock.deleteFeedback.mockResolvedValue(expected);

      const result = await controller.deleteFeedback('fb-123');

      expect(serviceMock.deleteFeedback).toHaveBeenCalledWith('fb-123');
      expect(result).toEqual(expected);
    });
  });
});
