import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as crypto from 'crypto';
import * as qrcode from 'qrcode';

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
import { AuditService } from '../audit/audit.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import {
  AuditAction,
  AuditSeverity,
  AuditResource,
} from '../audit/entities/security-audit-log.entity';
import {
  AttendanceGateway,
  QRRotatePayload,
} from './attendance.gateway';
import {
  InitializeAttendanceDto,
  MarkAttendanceDto,
  ManualMarkAttendeeDto,
  AttendanceInstanceQueryDto,
  AttendanceRecordQueryDto,
} from './dto';
import { PaginatedResult } from '../../common/pagination';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

@Injectable()
export class AttendanceService implements OnModuleDestroy {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly jwtSecret: string;
  private readonly rotationTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(AttendanceInstance)
    private readonly instanceRepository: Repository<AttendanceInstance>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(AttendanceLog)
    private readonly logRepository: Repository<AttendanceLog>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseStudent)
    private readonly courseStudentRepository: Repository<CourseStudent>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly queueService: QueueService,
    private readonly auditService: AuditService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('jwt.accessSecret') ||
      process.env.JWT_ACCESS_SECRET ||
      'default_jwt_secret_for_attendance_verification';
  }

  onModuleDestroy() {
    for (const [instanceId, timer] of this.rotationTimers.entries()) {
      clearInterval(timer);
      this.logger.log(`Cleared rotation timer for attendance session ${instanceId}`);
    }
    this.rotationTimers.clear();
  }

  /**
   * Calculate spherical surface distance (meters) using the Haversine formula.
   */
  calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's mean radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * Generate rotating short-lived token, store nonce in Redis active window,
   * render Base64 Data-URL QR code, and broadcast to projection room.
   */
  async generateRotatingQR(instanceId: string): Promise<QRRotatePayload> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
    });
    if (!instance || instance.isClose || new Date() > new Date(instance.expiresAt)) {
      this.stopRotationTimer(instanceId);
      throw new BadRequestException('Session is no longer active for QR rotation');
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const token = this.jwtService.sign(
      {
        instanceId: instance.id,
        courseId: instance.courseId,
        classType: instance.classType,
        nonce,
      },
      {
        secret: this.jwtSecret,
        expiresIn: '45s', // 20s active display + 25s transit latency window
      },
    );

    // Save nonce in Redis active window (valid for 60s)
    await this.cacheService.set(`cr:attendance:nonce:${instance.id}:${nonce}`, true, 60);

    // Generate Base64 Data-URL QR image
    const qrImage = await qrcode.toDataURL(token, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
    });

    instance.qrToken = token;
    instance.qrImage = qrImage;
    await this.instanceRepository.save(instance);

    const payload: QRRotatePayload = {
      instanceId: instance.id,
      qrImage,
      token,
      expiresInSeconds: 20,
      rotatedAt: new Date().toISOString(),
    };

    this.attendanceGateway.broadcastQRRotate(payload);
    return payload;
  }

  /**
   * Execute single rotation tick with error handling and automatic expiration closure.
   */
  async handleRotationTick(instanceId: string): Promise<void> {
    try {
      const instance = await this.instanceRepository.findOne({
        where: { id: instanceId },
      });
      if (
        !instance ||
        instance.isClose ||
        (instance.expiresAt && new Date() > new Date(instance.expiresAt))
      ) {
        if (instance && !instance.isClose) {
          instance.isClose = true;
          instance.qrToken = null;
          instance.qrImage = null;
          await this.instanceRepository.save(instance);
          this.attendanceGateway.broadcastSessionClosed(instanceId);
          await this.cacheService.scanAndInvalidate('cr:attendance:instances:*');
          await this.cacheService.scanAndInvalidate(`cr:attendance:instance:${instanceId}:*`);
        }
        this.stopRotationTimer(instanceId);
        return;
      }
      await this.generateRotatingQR(instanceId);
    } catch (err: any) {
      this.logger.warn(`Stopping rotation timer for ${instanceId}: ${err.message}`);
      this.stopRotationTimer(instanceId);
    }
  }

  /**
   * Starts on-demand QR projection stream when a client occupies the classroom room.
   */
  async startProjectionStream(instanceId: string): Promise<void> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
    });
    if (!instance) return;

    // Check expiration or closure
    if (instance.isClose || (instance.expiresAt && new Date() > new Date(instance.expiresAt))) {
      if (!instance.isClose) {
        instance.isClose = true;
        instance.qrToken = null;
        instance.qrImage = null;
        await this.instanceRepository.save(instance);
        this.attendanceGateway.broadcastSessionClosed(instanceId);
        await this.cacheService.scanAndInvalidate('cr:attendance:instances:*');
      }
      return;
    }

    // Immediately trigger a rotation tick to emit a fresh QR code without delay
    await this.handleRotationTick(instanceId);

    // If rotation timer not already running, start 20s interval
    if (!this.rotationTimers.has(instanceId)) {
      this.startRotationTimer(instanceId);
    }
  }

  /**
   * Stops QR projection stream when all clients leave the classroom room.
   */
  stopProjectionStream(instanceId: string): void {
    this.stopRotationTimer(instanceId);
    this.logger.log(`Stopped projection stream for ${instanceId} (zero active viewers)`);
  }

  /**
   * Checks all active rotation timers on socket disconnects and stops any empty rooms.
   */
  handleDisconnectCleanup(isRoomEmpty: (instanceId: string) => boolean): void {
    for (const instanceId of this.rotationTimers.keys()) {
      if (isRoomEmpty(instanceId)) {
        this.stopProjectionStream(instanceId);
      }
    }
  }

  /**
   * Start 20-second dynamic QR code rotation interval for Rep classroom projection.
   */
  startRotationTimer(instanceId: string): void {
    this.stopRotationTimer(instanceId);

    const timer = setInterval(() => {
      this.handleRotationTick(instanceId);
    }, 20000);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    this.rotationTimers.set(instanceId, timer);
  }

  /**
   * Stop active rotation interval.
   */
  stopRotationTimer(instanceId: string): void {
    const existing = this.rotationTimers.get(instanceId);
    if (existing) {
      clearInterval(existing);
      this.rotationTimers.delete(instanceId);
    }
  }

  /**
   * Initialize a new attendance session.
   * Enforces coordinate validation for in-person classes, pre-populates enrolled students
   * with 'absent' status, and starts dynamic WebSocket QR rotation.
   */
  async initializeAttendance(
    dto: InitializeAttendanceDto,
    creatorId?: string,
  ): Promise<AttendanceInstance> {
    const course = await this.courseRepository.findOne({
      where: { id: dto.courseId },
    });
    if (!course) {
      throw new NotFoundException(`Course "${dto.courseId}" not found`);
    }

    if (dto.classType === ClassType.IN_PERSON) {
      if (
        dto.latitude === undefined ||
        dto.longitude === undefined ||
        isNaN(dto.latitude) ||
        isNaN(dto.longitude)
      ) {
        throw new BadRequestException(
          'Location coordinates are required for in-person classes',
        );
      }
    }

    const durationMinutes = dto.durationMinutes || 60;
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const sessionDate = new Date(dto.date);

    // Initial nonce and token
    const initialNonce = crypto.randomBytes(16).toString('hex');
    const initialToken = this.jwtService.sign(
      {
        courseId: dto.courseId,
        classType: dto.classType,
        nonce: initialNonce,
      },
      {
        secret: this.jwtSecret,
        expiresIn: '45s',
      },
    );

    const initialQrImage = await qrcode.toDataURL(initialToken, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
    });

    const instance = this.instanceRepository.create({
      courseId: dto.courseId,
      date: sessionDate,
      qrToken: initialToken,
      qrImage: initialQrImage,
      expiresAt,
      latitude: dto.classType === ClassType.IN_PERSON ? dto.latitude : null,
      longitude: dto.classType === ClassType.IN_PERSON ? dto.longitude : null,
      classType: dto.classType,
      isClose: false,
    });

    // Save attendance instance and store initial rotation nonce
    const savedInstance = await this.instanceRepository.save(instance);

    await this.cacheService.set(
      `cr:attendance:nonce:${savedInstance.id}:${initialNonce}`,
      true,
      60,
    );

    // Offload bulk roster ingestion to BullMQ background worker
    await this.queueService.initializeAttendanceRoster(
      savedInstance.id,
      dto.courseId,
      sessionDate.toISOString(),
    );

    // Invalidate instance list cache (projection stream will start on-demand when client joins socket room)
    await this.cacheService.scanAndInvalidate('cr:attendance:instances:*');

    // Dispatch centralized notification across in-app and push channels
    await this.notificationDispatcher.dispatchAttendanceSessionCreated({
      courseId: dto.courseId,
      courseName: course.name,
      instance: savedInstance,
      creatorId,
    });

    return savedInstance;
  }

  /**
   * Verify token, geofence, and mark attendance with distributed mutex protection.
   */
  async markAttendance(
    dto: MarkAttendanceDto,
    user: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<{
    success: boolean;
    message: string;
    attendance: Attendance;
    presentCount: number;
  }> {
    const studentId = user.id;

    // 1. Decode & verify JWT signature
    let decoded: any;
    try {
      decoded = this.jwtService.verify(dto.token, { secret: this.jwtSecret });
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'Attendance QR code has expired. Please scan the current code displayed on the screen.',
        );
      }
      throw new UnauthorizedException('Invalid attendance token');
    }

    const { instanceId, courseId, nonce } = decoded;
    if (!instanceId || !courseId || !nonce) {
      throw new BadRequestException('Malformed attendance token payload');
    }

    // 2. Distributed concurrency lock in Redis (prevent duplicate submissions)
    const lockKey = `cr:lock:attendance:${instanceId}:${studentId}`;
    const acquired = await this.cacheService.setNx(lockKey, '1', 5);
    if (!acquired) {
      throw new ConflictException(
        'Attendance check-in already in progress. Please wait a moment.',
      );
    }

    try {
      // 3. Verify nonce in Redis active window
      const isNonceValid = await this.cacheService.get(
        `cr:attendance:nonce:${instanceId}:${nonce}`,
      );
      if (!isNonceValid) {
        throw new UnauthorizedException(
          'Attendance QR code has expired or rotated. Please scan the active code on the screen.',
        );
      }

      // 4. Fetch instance and verify session state
      const instance = await this.instanceRepository.findOne({
        where: { id: instanceId },
      });
      if (!instance) {
        throw new NotFoundException('Attendance session not found');
      }

      if (instance.isClose) {
        throw new BadRequestException('Attendance session is closed');
      }

      if (new Date() > new Date(instance.expiresAt)) {
        throw new BadRequestException('Attendance session has expired');
      }

      // 5. Geofence verification for in-person classes
      let locationChecked = false;
      let locationValid = true;
      let locationMessage = 'Online class - location check bypassed';

      if (instance.classType === ClassType.IN_PERSON) {
        locationChecked = true;
        if (
          dto.latitude === undefined ||
          dto.longitude === undefined ||
          isNaN(dto.latitude) ||
          isNaN(dto.longitude)
        ) {
          await this.logRepository.save({
            studentId,
            instanceId,
            locationChecked: true,
            locationValid: false,
            details: 'Location coordinates missing for in-person class',
          });
          throw new BadRequestException(
            'Device location coordinates are required for in-person classes',
          );
        }

        const distance = this.calculateHaversineDistance(
          instance.latitude || 0,
          instance.longitude || 0,
          dto.latitude,
          dto.longitude,
        );

        if (distance > 50) {
          locationValid = false;
          locationMessage = `Too far from classroom: ${distance}m away (maximum allowed: 50m)`;

          await this.logRepository.save({
            studentId,
            instanceId,
            locationChecked: true,
            locationValid: false,
            details: locationMessage,
          });

          await this.auditService.recordEvent({
            action: AuditAction.ATTENDANCE_GEOFENCE_BREACH,
            severity: AuditSeverity.HIGH,
            resource: AuditResource.ATTENDANCE,
            resourceId: instanceId,
            actorId: studentId,
            ipAddress,
            details: { distance, maxAllowed: 50 },
          });

          throw new BadRequestException(
            `Location verification failed: You are ${distance}m away from the classroom (maximum allowed: 50m)`,
          );
        }

        locationMessage = `Verified within ${distance}m of classroom`;
      }

      // 6. Transactional update of attendance record and security log
      const result = await this.dataSource.transaction(async (manager) => {
        let record = await manager.findOne(Attendance, {
          where: { instanceId, studentId },
        });

        if (!record) {
          record = manager.create(Attendance, {
            instanceId,
            courseId,
            date: instance.date,
            studentId,
            status: AttendanceStatus.PRESENT,
          });
        } else {
          record.status = AttendanceStatus.PRESENT;
          record.date = new Date();
        }

        const savedAttendance = await manager.save(Attendance, record);

        await manager.save(AttendanceLog, {
          studentId,
          instanceId,
          locationChecked,
          locationValid,
          details: locationMessage,
        });

        const presentCount = await manager.count(Attendance, {
          where: { instanceId, status: AttendanceStatus.PRESENT },
        });

        return { savedAttendance, presentCount };
      });

      // 7. Real-time projection broadcast to Rep screen
      this.attendanceGateway.broadcastAttendeeMarked({
        instanceId,
        studentId,
        studentName: user.name,
        markedAt: new Date(),
        presentCount: result.presentCount,
      });

      await this.auditService.recordEvent({
        action: AuditAction.ATTENDANCE_MARKED,
        severity: AuditSeverity.INFO,
        resource: AuditResource.ATTENDANCE,
        resourceId: instanceId,
        actorId: studentId,
        ipAddress,
        details: { courseId, status: AttendanceStatus.PRESENT },
      });

      await this.cacheService.scanAndInvalidate(`cr:attendance:instance:${instanceId}:*`);

      return {
        success: true,
        message: 'Attendance verified and marked successfully',
        attendance: result.savedAttendance,
        presentCount: result.presentCount,
      };
    } finally {
      // Release lock
      await this.cacheService.del(lockKey);
    }
  }

  /**
   * Close attendance session, invalidate tokens, and terminate projection.
   */
  async closeAttendance(instanceId: string): Promise<{ message: string }> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new NotFoundException(`Attendance session "${instanceId}" not found`);
    }

    if (instance.isClose) {
      throw new BadRequestException('Attendance session is already closed');
    }

    instance.isClose = true;
    instance.qrToken = null;
    instance.qrImage = null;
    await this.instanceRepository.save(instance);

    this.stopRotationTimer(instanceId);
    this.attendanceGateway.broadcastSessionClosed(instanceId);

    await this.cacheService.scanAndInvalidate('cr:attendance:instances:*');
    await this.cacheService.scanAndInvalidate(`cr:attendance:instance:${instanceId}:*`);

    return { message: 'Attendance session successfully closed' };
  }

  /**
   * Rep manually marks or updates a student attendee status.
   */
  async manualMarkAttendee(dto: ManualMarkAttendeeDto): Promise<Attendance> {
    const attendance = await this.attendanceRepository.findOne({
      where: { id: dto.attendanceId },
      relations: ['student'],
    });
    if (!attendance) {
      throw new NotFoundException(`Attendee record "${dto.attendanceId}" not found`);
    }

    attendance.status = dto.status;
    if (dto.status === AttendanceStatus.PRESENT) {
      attendance.date = new Date();
    }
    const saved = await this.attendanceRepository.save(attendance);

    await this.cacheService.scanAndInvalidate(
      `cr:attendance:instance:${attendance.instanceId}:*`,
    );

    // Broadcast attendee update to projector stream with updated count
    const presentCount = await this.attendanceRepository.count({
      where: { instanceId: attendance.instanceId, status: AttendanceStatus.PRESENT },
    });

    this.attendanceGateway.broadcastAttendeeMarked({
      instanceId: attendance.instanceId,
      studentId: attendance.studentId,
      studentName: attendance.student?.name,
      markedAt: attendance.date,
      presentCount,
    });

    return saved;
  }

  /**
   * List attendance sessions with pagination and filters.
   */
  async getAttendanceInstances(
    query: AttendanceInstanceQueryDto,
  ): Promise<PaginatedResult<AttendanceInstance>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const cacheKey = `cr:attendance:instances:${query.courseId || 'all'}:${query.classType || 'all'}:${page}:${limit}`;

    const cached =
      await this.cacheService.get<PaginatedResult<AttendanceInstance>>(cacheKey);
    if (cached) return cached;

    const qb = this.instanceRepository
      .createQueryBuilder('instance')
      .leftJoinAndSelect('instance.course', 'course');

    if (query.courseId) {
      qb.andWhere('instance.courseId = :courseId', { courseId: query.courseId });
    }

    if (query.classType) {
      qb.andWhere('instance.classType = :classType', {
        classType: query.classType,
      });
    }

    if (query.date) {
      qb.andWhere('DATE(instance.date) = DATE(:date)', { date: query.date });
    }

    qb.orderBy('instance.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Dynamically check and auto-close any sessions that passed their expiration time
    const now = new Date();
    const expiredInstances = items.filter(
      (inst) => !inst.isClose && inst.expiresAt && now > new Date(inst.expiresAt),
    );

    if (expiredInstances.length > 0) {
      await Promise.all(
        expiredInstances.map(async (inst) => {
          inst.isClose = true;
          inst.qrToken = null;
          inst.qrImage = null;
          await this.instanceRepository.save(inst);
          this.stopRotationTimer(inst.id);
          this.attendanceGateway.broadcastSessionClosed(inst.id);
        }),
      );
      await this.cacheService.scanAndInvalidate('cr:attendance:instances:*');
    }

    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<AttendanceInstance> = {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Retrieve attendance session details, attendees list, and stats.
   */
  async getAttendanceByInstance(
    instanceId: string,
    query: AttendanceRecordQueryDto,
  ): Promise<any> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
      relations: ['course'],
    });
    if (!instance) {
      throw new NotFoundException(`Attendance session "${instanceId}" not found`);
    }

    // Auto-close if passed expiration time
    if (!instance.isClose && instance.expiresAt && new Date() > new Date(instance.expiresAt)) {
      instance.isClose = true;
      instance.qrToken = null;
      instance.qrImage = null;
      await this.instanceRepository.save(instance);
      this.stopRotationTimer(instance.id);
      this.attendanceGateway.broadcastSessionClosed(instance.id);
      await this.cacheService.scanAndInvalidate('cr:attendance:instances:*');
      await this.cacheService.scanAndInvalidate(`cr:attendance:instance:${instance.id}:*`);
    }

    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.attendanceRepository
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.student', 'student')
      .where('att.instanceId = :instanceId', { instanceId });

    if (query.studentId) {
      qb.andWhere('att.studentId = :studentId', { studentId: query.studentId });
    }

    if (query.status) {
      qb.andWhere('att.status = :status', { status: query.status });
    }

    qb.orderBy('att.status', 'ASC')
      .addOrderBy('student.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [attendances, total] = await qb.getManyAndCount();

    const [presentCount, absentCount, excusedCount] = await Promise.all([
      this.attendanceRepository.count({
        where: { instanceId, status: AttendanceStatus.PRESENT },
      }),
      this.attendanceRepository.count({
        where: { instanceId, status: AttendanceStatus.ABSENT },
      }),
      this.attendanceRepository.count({
        where: { instanceId, status: AttendanceStatus.EXCUSED },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      instance,
      stats: {
        totalEnrolled: presentCount + absentCount + excusedCount,
        presentCount,
        absentCount,
        excusedCount,
      },
      attendees: {
        items: attendances,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  /**
   * Stream full session attendance roster as an optimized RFC-4180 CSV with UTF-8 BOM.
   * Joins real student names directly at the database level and streams chunks into the HTTP response.
   */
  async exportAttendanceCsv(instanceId: string, res: Response): Promise<void> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
      relations: ['course'],
    });

    if (!instance) {
      throw new NotFoundException(`Attendance session "${instanceId}" not found`);
    }

    const attendees = await this.attendanceRepository
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.student', 'student')
      .where('att.instanceId = :instanceId', { instanceId })
      .orderBy('att.status', 'ASC')
      .addOrderBy('student.name', 'ASC')
      .getMany();

    const safeCourseId = (instance.courseId || 'course').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = instance.date ? new Date(instance.date).toISOString().slice(0, 10) : 'session';
    const fileName = `attendance_${safeCourseId}_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Write UTF-8 BOM (\uFEFF) for compatibility with Excel, Numbers, and Google Sheets
    res.write('\uFEFF');

    const headers = [
      'Student ID',
      'Student Name',
      'Status',
      'Check-In Time',
      'Course Code',
      'Course Name',
      'Session Date',
      'Session Time',
      'Class Type',
      'Location / Geofence',
    ];

    const escapeCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    res.write(headers.map(escapeCsv).join(',') + '\r\n');

    const sessionDate = new Date(instance.date);
    const formattedDate = sessionDate.toLocaleDateString();
    const formattedTime = sessionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const classTypeStr = instance.classType === ClassType.IN_PERSON ? 'In-Person' : 'Online / Remote';
    const locationStr =
      instance.classType === ClassType.IN_PERSON && instance.latitude && instance.longitude
        ? `${instance.latitude.toFixed(5)}, ${instance.longitude.toFixed(5)} (50m)`
        : 'N/A';
    const courseName = instance.course?.name || '';

    for (const record of attendees) {
      const studentId = record.studentId || '';
      const studentName = record.student?.name || 'Enrolled Student';
      const status = (record.status || 'absent').toUpperCase();
      const checkInTime =
        record.status === AttendanceStatus.PRESENT && record.date
          ? new Date(record.date).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          : 'N/A';

      const line = [
        escapeCsv(studentId),
        escapeCsv(studentName),
        escapeCsv(status),
        escapeCsv(checkInTime),
        escapeCsv(instance.courseId),
        escapeCsv(courseName),
        escapeCsv(formattedDate),
        escapeCsv(formattedTime),
        escapeCsv(classTypeStr),
        escapeCsv(locationStr),
      ].join(',') + '\r\n';

      res.write(line);
    }

    res.end();
  }

  /**
   * Retrieve student's own attendance history across all courses.
   */
  async getMyAttendanceHistory(
    user: AuthenticatedUser,
    query: AttendanceRecordQueryDto,
  ): Promise<PaginatedResult<Attendance>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const studentId = user.id;

    const qb = this.attendanceRepository
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.course', 'course')
      .leftJoinAndSelect('att.instance', 'instance')
      .where('att.studentId = :studentId', { studentId });

    if (query.status) {
      qb.andWhere('att.status = :status', { status: query.status });
    }

    qb.orderBy('att.date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Cascade delete attendance session, all attendee records, and stop timers.
   */
  async deleteInstance(instanceId: string): Promise<{ message: string }> {
    const instance = await this.instanceRepository.findOne({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new NotFoundException(`Attendance session "${instanceId}" not found`);
    }

    this.stopRotationTimer(instanceId);
    await this.instanceRepository.remove(instance);

    await this.cacheService.scanAndInvalidate('cr:attendance:*');

    return {
      message: 'Attendance session and all associated records successfully deleted',
    };
  }

  /**
   * Delete single attendance record.
   */
  async deleteAttendanceRecord(
    attendanceId: string,
  ): Promise<{ message: string }> {
    const record = await this.attendanceRepository.findOne({
      where: { id: attendanceId },
    });
    if (!record) {
      throw new NotFoundException(`Attendance record "${attendanceId}" not found`);
    }

    await this.attendanceRepository.remove(record);
    await this.cacheService.scanAndInvalidate(
      `cr:attendance:instance:${record.instanceId}:*`,
    );

    return { message: 'Attendance record deleted successfully' };
  }
}

