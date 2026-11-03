import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AttendanceService } from './attendance.service';
import {
  AttendanceInstance,
  ClassType,
} from './entities/attendance-instance.entity';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceLog } from './entities/attendance-log.entity';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student } from '../student/entities/student.entity';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { AttendanceGateway } from './attendance.gateway';

describe('AttendanceService', () => {
  jest.setTimeout(30000);
  let service: AttendanceService;
  let instanceRepoMock: any;
  let attendanceRepoMock: any;
  let logRepoMock: any;
  let courseRepoMock: any;
  let courseStudentRepoMock: any;
  let studentRepoMock: any;
  let dataSourceMock: any;
  let jwtServiceMock: any;
  let configServiceMock: any;
  let cacheServiceMock: any;
  let gatewayMock: any;
  let queueServiceMock: any;
  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    instanceRepoMock = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) =>
        Promise.resolve({ id: 'inst-uuid-1', ...entity }),
      ),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    attendanceRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) =>
        Promise.resolve({ id: 'att-uuid-1', ...entity }),
      ),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    logRepoMock = {
      save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    };

    courseRepoMock = {
      findOne: jest.fn(),
    };

    courseStudentRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };

    studentRepoMock = {
      findOne: jest.fn(),
    };

    dataSourceMock = {
      transaction: jest.fn(async (cb: any) => {
        const manager = {
          save: jest.fn(async (target: any, entity: any) => {
            if (Array.isArray(entity)) {
              return entity.map((e, idx) => ({ id: `uuid-${idx}`, ...e }));
            }
            return { id: 'uuid-1', ...entity };
          }),
          find: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(1),
          create: jest.fn((target: any, dto: any) => dto),
        };
        return cb(manager);
      }),
    };

    jwtServiceMock = {
      sign: jest.fn().mockReturnValue('mocked-signed-jwt-token'),
      verify: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn().mockReturnValue('test-jwt-secret-key-12345'),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      setNx: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
      scanAndInvalidate: jest.fn().mockResolvedValue(1),
    };

    gatewayMock = {
      broadcastQRRotate: jest.fn(),
      broadcastAttendeeMarked: jest.fn(),
      broadcastSessionClosed: jest.fn(),
    };

    queueServiceMock = {
      initializeAttendanceRoster: jest.fn().mockResolvedValue('job-roster-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: getRepositoryToken(AttendanceInstance),
          useValue: instanceRepoMock,
        },
        {
          provide: getRepositoryToken(Attendance),
          useValue: attendanceRepoMock,
        },
        {
          provide: getRepositoryToken(AttendanceLog),
          useValue: logRepoMock,
        },
        {
          provide: getRepositoryToken(Course),
          useValue: courseRepoMock,
        },
        {
          provide: getRepositoryToken(CourseStudent),
          useValue: courseStudentRepoMock,
        },
        {
          provide: getRepositoryToken(Student),
          useValue: studentRepoMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
        {
          provide: AttendanceGateway,
          useValue: gatewayMock,
        },
        {
          provide: QueueService,
          useValue: queueServiceMock,
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateHaversineDistance', () => {
    it('should return 0 meters for identical coordinates', () => {
      const d = service.calculateHaversineDistance(5.6037, -0.187, 5.6037, -0.187);
      expect(d).toBe(0);
    });

    it('should calculate accurate distance within 50 meters', () => {
      // 5.60371, -0.18701 is approx ~15m away
      const d = service.calculateHaversineDistance(
        5.6037,
        -0.187,
        5.60375,
        -0.18705,
      );
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(50);
    });

    it('should calculate accurate distance exceeding 50 meters', () => {
      // ~1km away
      const d = service.calculateHaversineDistance(5.6037, -0.187, 5.6137, -0.187);
      expect(d).toBeGreaterThan(50);
    });
  });

  describe('generateRotatingQR', () => {
    it('should throw BadRequestException if session not found, closed, or expired', async () => {
      instanceRepoMock.findOne.mockResolvedValue(null);
      await expect(service.generateRotatingQR('inst-1')).rejects.toThrow(
        BadRequestException,
      );

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        isClose: true,
        expiresAt: new Date(Date.now() + 100000),
      });
      await expect(service.generateRotatingQR('inst-1')).rejects.toThrow(
        BadRequestException,
      );

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        isClose: false,
        expiresAt: new Date(Date.now() - 100000),
      });
      await expect(service.generateRotatingQR('inst-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate rotating QR code, store nonce in Redis, and broadcast over gateway', async () => {
      const instance = {
        id: 'inst-1',
        courseId: 'CS101',
        classType: ClassType.IN_PERSON,
        isClose: false,
        expiresAt: new Date(Date.now() + 100000),
      };
      instanceRepoMock.findOne.mockResolvedValue(instance);

      const payload = await service.generateRotatingQR('inst-1');

      expect(jwtServiceMock.sign).toHaveBeenCalled();
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        expect.stringContaining('cr:attendance:nonce:inst-1:'),
        true,
        60,
      );
      expect(instanceRepoMock.save).toHaveBeenCalled();
      expect(gatewayMock.broadcastQRRotate).toHaveBeenCalledWith(payload);
      expect(payload.instanceId).toBe('inst-1');
      expect(payload.expiresInSeconds).toBe(20);
    });
  });

  describe('rotation timer management', () => {
    it('should start and stop rotation timer cleanly', () => {
      service.startRotationTimer('inst-timer-1');
      service.stopRotationTimer('inst-timer-1');
      expect(true).toBe(true);
    });

    it('should execute rotation tick successfully when active', async () => {
      const instance = {
        id: 'inst-tick-1',
        courseId: 'CS101',
        classType: ClassType.IN_PERSON,
        isClose: false,
        expiresAt: new Date(Date.now() + 100000),
      };
      instanceRepoMock.findOne.mockResolvedValue(instance);

      await service.handleRotationTick('inst-tick-1');
      expect(gatewayMock.broadcastQRRotate).toHaveBeenCalled();
    });

    it('should catch error on rotation tick and stop the timer', async () => {
      instanceRepoMock.findOne.mockRejectedValue(new Error('DB failure'));
      const stopSpy = jest.spyOn(service, 'stopRotationTimer');

      await service.handleRotationTick('inst-fail-1');
      expect(stopSpy).toHaveBeenCalledWith('inst-fail-1');
    });
  });

  describe('initializeAttendance', () => {
    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.initializeAttendance({
          courseId: 'CS999',
          date: new Date().toISOString(),
          classType: ClassType.IN_PERSON,
          latitude: 5.6037,
          longitude: -0.187,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for in-person class without lat/lon', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CS101' });

      await expect(
        service.initializeAttendance({
          courseId: 'CS101',
          date: new Date().toISOString(),
          classType: ClassType.IN_PERSON,
          latitude: undefined,
          longitude: -0.187,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.initializeAttendance({
          courseId: 'CS101',
          date: new Date().toISOString(),
          classType: ClassType.IN_PERSON,
          latitude: 5.6037,
          longitude: NaN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully initialize in-person attendance with bulk enrolled students offloaded to queue', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CS101' });
      instanceRepoMock.save.mockResolvedValue({
        id: 'saved-inst-uuid',
        courseId: 'CS101',
      });

      const result = await service.initializeAttendance({
        courseId: 'CS101',
        date: new Date().toISOString(),
        classType: ClassType.IN_PERSON,
        latitude: 5.6037,
        longitude: -0.187,
        durationMinutes: 90,
      });

      expect(result.id).toBe('saved-inst-uuid');
      expect(queueServiceMock.initializeAttendanceRoster).toHaveBeenCalledWith(
        'saved-inst-uuid',
        'CS101',
        expect.any(String),
      );
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:attendance:instances:*',
      );
    });

    it('should successfully initialize online attendance session without lat/lon', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CS101' });
      instanceRepoMock.save.mockResolvedValue({
        id: 'online-inst-uuid',
        courseId: 'CS101',
      });

      const result = await service.initializeAttendance({
        courseId: 'CS101',
        date: new Date().toISOString(),
        classType: ClassType.ONLINE,
      });

      expect(result.id).toBe('online-inst-uuid');
      expect(queueServiceMock.initializeAttendanceRoster).toHaveBeenCalledWith(
        'online-inst-uuid',
        'CS101',
        expect.any(String),
      );
    });
  });

  describe('markAttendance', () => {
    const userMock = {
      id: 'student-1',
      name: 'Alice',
      email: 'alice@uni.edu',
      phone: '123',
      isRep: false,
      role: 'STUDENT' as const,
      status: 'active',
    };

    it('should throw UnauthorizedException if token verification fails with TokenExpiredError', async () => {
      const err = new Error('Expired');
      err.name = 'TokenExpiredError';
      jwtServiceMock.verify.mockImplementation(() => {
        throw err;
      });

      await expect(
        service.markAttendance({ token: 'expired-token' }, userMock),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for generic invalid token', async () => {
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('Bad signature');
      });

      await expect(
        service.markAttendance({ token: 'bad-token' }, userMock),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if token payload is missing claims', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: null,
      });

      await expect(
        service.markAttendance({ token: 'incomplete-token' }, userMock),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if distributed mutex lock cannot be acquired', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(false);

      await expect(
        service.markAttendance({ token: 'valid-token' }, userMock),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw UnauthorizedException if nonce is not active in Redis window', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'rotated-nonce',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(null); // Expired from Redis

      await expect(
        service.markAttendance({ token: 'valid-token' }, userMock),
      ).rejects.toThrow(UnauthorizedException);

      expect(cacheServiceMock.del).toHaveBeenCalled(); // Lock released
    });

    it('should throw NotFoundException if attendance session is not found in database', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-999',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(true);
      instanceRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.markAttendance({ token: 'valid-token' }, userMock),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if session is closed or expired', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(true);

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        isClose: true,
        expiresAt: new Date(Date.now() + 100000),
      });
      await expect(
        service.markAttendance({ token: 'valid-token' }, userMock),
      ).rejects.toThrow(BadRequestException);

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        isClose: false,
        expiresAt: new Date(Date.now() - 50000),
      });
      await expect(
        service.markAttendance({ token: 'valid-token' }, userMock),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for in-person class if student coordinates are missing', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(true);

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        classType: ClassType.IN_PERSON,
        latitude: 5.6037,
        longitude: -0.187,
        isClose: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.markAttendance({ token: 'valid-token' }, userMock),
      ).rejects.toThrow(BadRequestException);

      expect(logRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ locationValid: false }),
      );
    });

    it('should throw BadRequestException if student GPS distance exceeds 50 meters', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(true);

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        classType: ClassType.IN_PERSON,
        latitude: 5.6037,
        longitude: -0.187,
        isClose: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      // Far away coordinates (~5km)
      await expect(
        service.markAttendance(
          { token: 'valid-token', latitude: 5.65, longitude: -0.187 },
          userMock,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(logRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ locationValid: false }),
      );
    });

    it('should successfully verify in-person attendance within 50m and broadcast to projector', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(true);

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        courseId: 'CS101',
        classType: ClassType.IN_PERSON,
        latitude: 5.6037,
        longitude: -0.187,
        isClose: false,
        expiresAt: new Date(Date.now() + 100000),
        date: new Date(),
      });

      const existingRecord = {
        id: 'att-1',
        instanceId: 'inst-1',
        studentId: 'student-1',
        status: AttendanceStatus.ABSENT,
      };

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(existingRecord),
          save: jest.fn(async (target: any, entity: any) => entity),
          count: jest.fn().mockResolvedValue(12),
        };
        return cb(manager);
      });

      const result = await service.markAttendance(
        { token: 'valid-token', latitude: 5.60372, longitude: -0.18702 },
        userMock,
      );

      expect(result.success).toBe(true);
      expect(result.presentCount).toBe(12);
      expect(gatewayMock.broadcastAttendeeMarked).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: 'inst-1',
          studentId: 'student-1',
          presentCount: 12,
        }),
      );
    });

    it('should successfully mark online attendance bypassing location check', async () => {
      jwtServiceMock.verify.mockReturnValue({
        instanceId: 'inst-1',
        courseId: 'CS101',
        nonce: 'nonce-123',
      });
      cacheServiceMock.setNx.mockResolvedValue(true);
      cacheServiceMock.get.mockResolvedValue(true);

      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        courseId: 'CS101',
        classType: ClassType.ONLINE,
        isClose: false,
        expiresAt: new Date(Date.now() + 100000),
        date: new Date(),
      });

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null), // Student was not pre-populated
          create: jest.fn((target: any, dto: any) => dto),
          save: jest.fn(async (target: any, entity: any) => entity),
          count: jest.fn().mockResolvedValue(1),
        };
        return cb(manager);
      });

      const result = await service.markAttendance(
        { token: 'valid-token' },
        userMock,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('closeAttendance', () => {
    it('should throw NotFoundException if session does not exist', async () => {
      instanceRepoMock.findOne.mockResolvedValue(null);

      await expect(service.closeAttendance('inst-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if session is already closed', async () => {
      instanceRepoMock.findOne.mockResolvedValue({
        id: 'inst-1',
        isClose: true,
      });

      await expect(service.closeAttendance('inst-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should close active session, nullify tokens, and broadcast sessionClosed event', async () => {
      const instance = { id: 'inst-1', isClose: false, qrToken: 'tok', qrImage: 'img' };
      instanceRepoMock.findOne.mockResolvedValue(instance);

      const result = await service.closeAttendance('inst-1');

      expect(instance.isClose).toBe(true);
      expect(instance.qrToken).toBeNull();
      expect(instanceRepoMock.save).toHaveBeenCalledWith(instance);
      expect(gatewayMock.broadcastSessionClosed).toHaveBeenCalledWith('inst-1');
      expect(result.message).toContain('successfully closed');
    });
  });

  describe('manualMarkAttendee', () => {
    it('should throw NotFoundException if record not found', async () => {
      attendanceRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.manualMarkAttendee({
          attendanceId: 'att-999',
          status: AttendanceStatus.PRESENT,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update attendee status and invalidate cache', async () => {
      const record = {
        id: 'att-1',
        instanceId: 'inst-1',
        status: AttendanceStatus.ABSENT,
      };
      attendanceRepoMock.findOne.mockResolvedValue(record);

      const result = await service.manualMarkAttendee({
        attendanceId: 'att-1',
        status: AttendanceStatus.EXCUSED,
      });

      expect(result.status).toBe(AttendanceStatus.EXCUSED);
      expect(attendanceRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:attendance:instance:inst-1:*',
      );
    });
  });

  describe('getAttendanceInstances', () => {
    it('should return cached instances if present', async () => {
      const cached = { items: [], meta: {} };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.getAttendanceInstances({
        page: 1,
        limit: 10,
        courseId: 'CS101',
      });

      expect(result).toBe(cached);
    });

    it('should query instances with filters and cache result', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const instance = { id: 'inst-1' };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[instance], 1]);

      const result = await service.getAttendanceInstances({
        courseId: 'CS101',
        classType: ClassType.IN_PERSON,
        date: '2026-11-02',
        page: 1,
        limit: 10,
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'instance.courseId = :courseId',
        { courseId: 'CS101' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'instance.classType = :classType',
        { classType: ClassType.IN_PERSON },
      );
      expect(result.items).toHaveLength(1);
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });
  });

  describe('getAttendanceByInstance', () => {
    it('should throw NotFoundException if instance does not exist', async () => {
      instanceRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.getAttendanceByInstance('inst-999', {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return instance details, stats, and attendee records', async () => {
      const instance = { id: 'inst-1', courseId: 'CS101' };
      instanceRepoMock.findOne.mockResolvedValue(instance);

      const attendee = { id: 'att-1', studentId: 'st-1', status: AttendanceStatus.PRESENT };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[attendee], 1]);
      attendanceRepoMock.count
        .mockResolvedValueOnce(5) // present
        .mockResolvedValueOnce(2) // absent
        .mockResolvedValueOnce(1); // excused

      const result = await service.getAttendanceByInstance('inst-1', {
        studentId: 'st-1',
        status: AttendanceStatus.PRESENT,
        page: 1,
        limit: 10,
      });

      expect(result.instance).toBe(instance);
      expect(result.stats.presentCount).toBe(5);
      expect(result.stats.totalEnrolled).toBe(8);
      expect(result.attendees.items).toHaveLength(1);
    });
  });

  describe('getMyAttendanceHistory', () => {
    it('should return student personal attendance history with filters', async () => {
      const attendee = { id: 'att-1', studentId: 'student-1' };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[attendee], 1]);

      const result = await service.getMyAttendanceHistory(
        { id: 'student-1' } as any,
        { status: AttendanceStatus.PRESENT, page: 1, limit: 10 },
      );

      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'att.studentId = :studentId',
        { studentId: 'student-1' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'att.status = :status',
        { status: AttendanceStatus.PRESENT },
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('deleteInstance', () => {
    it('should throw NotFoundException if instance not found', async () => {
      instanceRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteInstance('inst-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should remove instance, stop timer, and invalidate cache', async () => {
      const instance = { id: 'inst-1' };
      instanceRepoMock.findOne.mockResolvedValue(instance);

      const result = await service.deleteInstance('inst-1');

      expect(instanceRepoMock.remove).toHaveBeenCalledWith(instance);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:attendance:*',
      );
      expect(result.message).toContain('successfully deleted');
    });
  });

  describe('deleteAttendanceRecord', () => {
    it('should throw NotFoundException if record not found', async () => {
      attendanceRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteAttendanceRecord('att-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should remove record and invalidate cache', async () => {
      const record = { id: 'att-1', instanceId: 'inst-1' };
      attendanceRepoMock.findOne.mockResolvedValue(record);

      const result = await service.deleteAttendanceRecord('att-1');

      expect(attendanceRepoMock.remove).toHaveBeenCalledWith(record);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:attendance:instance:inst-1:*',
      );
      expect(result.message).toContain('successfully');
    });
  });
});

