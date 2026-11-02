import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import {
  InitializeAttendanceDto,
  MarkAttendanceDto,
  ManualMarkAttendeeDto,
  AttendanceInstanceQueryDto,
  AttendanceRecordQueryDto,
} from './dto';
import { ClassType } from './entities/attendance-instance.entity';
import { AttendanceStatus } from './entities/attendance.entity';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let serviceMock: {
    initializeAttendance: jest.Mock;
    markAttendance: jest.Mock;
    closeAttendance: jest.Mock;
    manualMarkAttendee: jest.Mock;
    getMyAttendanceHistory: jest.Mock;
    getAttendanceInstances: jest.Mock;
    getAttendanceByInstance: jest.Mock;
    deleteInstance: jest.Mock;
    deleteAttendanceRecord: jest.Mock;
  };

  const userMock: AuthenticatedUser = {
    id: 'st-1',
    email: 'st@uni.edu',
    name: 'Alice',
    phone: '123',
    isRep: false,
    role: 'STUDENT',
    status: 'active',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serviceMock = {
      initializeAttendance: jest.fn(),
      markAttendance: jest.fn(),
      closeAttendance: jest.fn(),
      manualMarkAttendee: jest.fn(),
      getMyAttendanceHistory: jest.fn(),
      getAttendanceInstances: jest.fn(),
      getAttendanceByInstance: jest.fn(),
      deleteInstance: jest.fn(),
      deleteAttendanceRecord: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('initializeAttendance', () => {
    it('should delegate to attendanceService.initializeAttendance', async () => {
      const dto: InitializeAttendanceDto = {
        courseId: 'CS101',
        date: new Date().toISOString(),
        classType: ClassType.IN_PERSON,
        latitude: 5.6037,
        longitude: -0.187,
      };
      const expected = { id: 'inst-1' };
      serviceMock.initializeAttendance.mockResolvedValue(expected);

      const result = await controller.initializeAttendance(dto);

      expect(result).toBe(expected);
      expect(serviceMock.initializeAttendance).toHaveBeenCalledWith(dto);
    });
  });

  describe('markAttendance', () => {
    it('should delegate to attendanceService.markAttendance with user context', async () => {
      const dto: MarkAttendanceDto = { token: 'jwt-qr-token' };
      const expected = { success: true };
      serviceMock.markAttendance.mockResolvedValue(expected);

      const result = await controller.markAttendance(dto, userMock);

      expect(result).toBe(expected);
      expect(serviceMock.markAttendance).toHaveBeenCalledWith(dto, userMock);
    });
  });

  describe('closeAttendance', () => {
    it('should delegate to attendanceService.closeAttendance', async () => {
      const expected = { message: 'Closed' };
      serviceMock.closeAttendance.mockResolvedValue(expected);

      const result = await controller.closeAttendance('inst-1');

      expect(result).toBe(expected);
      expect(serviceMock.closeAttendance).toHaveBeenCalledWith('inst-1');
    });
  });

  describe('manualMarkAttendee', () => {
    it('should delegate to attendanceService.manualMarkAttendee', async () => {
      const dto: ManualMarkAttendeeDto = {
        attendanceId: 'att-1',
        status: AttendanceStatus.PRESENT,
      };
      const expected = { id: 'att-1', status: AttendanceStatus.PRESENT };
      serviceMock.manualMarkAttendee.mockResolvedValue(expected);

      const result = await controller.manualMarkAttendee(dto);

      expect(result).toBe(expected);
      expect(serviceMock.manualMarkAttendee).toHaveBeenCalledWith(dto);
    });
  });

  describe('getMyAttendanceHistory', () => {
    it('should delegate to attendanceService.getMyAttendanceHistory', async () => {
      const query: AttendanceRecordQueryDto = { page: 1, limit: 10 };
      const expected = { items: [], meta: {} };
      serviceMock.getMyAttendanceHistory.mockResolvedValue(expected);

      const result = await controller.getMyAttendanceHistory(userMock, query);

      expect(result).toBe(expected);
      expect(serviceMock.getMyAttendanceHistory).toHaveBeenCalledWith(userMock, query);
    });
  });

  describe('getAttendanceInstances', () => {
    it('should delegate to attendanceService.getAttendanceInstances', async () => {
      const query: AttendanceInstanceQueryDto = { courseId: 'CS101', page: 1, limit: 10 };
      const expected = { items: [], meta: {} };
      serviceMock.getAttendanceInstances.mockResolvedValue(expected);

      const result = await controller.getAttendanceInstances(query);

      expect(result).toBe(expected);
      expect(serviceMock.getAttendanceInstances).toHaveBeenCalledWith(query);
    });
  });

  describe('getAttendanceByInstance', () => {
    it('should delegate to attendanceService.getAttendanceByInstance', async () => {
      const query: AttendanceRecordQueryDto = { status: AttendanceStatus.PRESENT, page: 1, limit: 10 };
      const expected = { instance: {}, stats: {} };
      serviceMock.getAttendanceByInstance.mockResolvedValue(expected);

      const result = await controller.getAttendanceByInstance('inst-1', query);

      expect(result).toBe(expected);
      expect(serviceMock.getAttendanceByInstance).toHaveBeenCalledWith('inst-1', query);
    });
  });

  describe('deleteInstance', () => {
    it('should delegate to attendanceService.deleteInstance', async () => {
      const expected = { message: 'Deleted' };
      serviceMock.deleteInstance.mockResolvedValue(expected);

      const result = await controller.deleteInstance('inst-1');

      expect(result).toBe(expected);
      expect(serviceMock.deleteInstance).toHaveBeenCalledWith('inst-1');
    });
  });

  describe('deleteAttendanceRecord', () => {
    it('should delegate to attendanceService.deleteAttendanceRecord', async () => {
      const expected = { message: 'Record deleted' };
      serviceMock.deleteAttendanceRecord.mockResolvedValue(expected);

      const result = await controller.deleteAttendanceRecord('att-1');

      expect(result).toBe(expected);
      expect(serviceMock.deleteAttendanceRecord).toHaveBeenCalledWith('att-1');
    });
  });
});

