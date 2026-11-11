import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AttendanceService } from './attendance.service';
import {
  InitializeAttendanceDto,
  MarkAttendanceDto,
  ManualMarkAttendeeDto,
  AttendanceInstanceQueryDto,
  AttendanceRecordQueryDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * Initialize a new attendance session.
   * Rep only. Bulk pre-populates enrolled students as absent and starts rotating QR code.
   */
  @Post('initialize')
  @Roles(UserRole.REP)
  async initializeAttendance(@Body() dto: InitializeAttendanceDto) {
    return this.attendanceService.initializeAttendance(dto);
  }

  /**
   * Student check-in via dynamic QR token scan with geofence verification.
   * Protected with distributed mutex to eliminate double-marking race conditions.
   */
  @Post('mark')
  @UseGuards(ThrottlerGuard)
  @Throttle({ attendance: { limit: 5, ttl: 60000 } })
  @Roles(UserRole.STUDENT, UserRole.REP)
  async markAttendance(
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientIp() clientIp: string = '127.0.0.1',
  ) {
    return this.attendanceService.markAttendance(dto, user, clientIp);
  }

  /**
   * Prematurely close an attendance session.
   * Rep only. Invalidates tokens and terminates classroom projection stream.
   */
  @Post('close/:instanceId')
  @Roles(UserRole.REP)
  async closeAttendance(@Param('instanceId') instanceId: string) {
    return this.attendanceService.closeAttendance(instanceId);
  }

  /**
   * Manually update attendee status (present, absent, excused).
   * Rep only.
   */
  @Put('attendee')
  @Roles(UserRole.REP)
  async manualMarkAttendee(@Body() dto: ManualMarkAttendeeDto) {
    return this.attendanceService.manualMarkAttendee(dto);
  }

  /**
   * Retrieve student's own attendance history across all enrolled courses.
   */
  @Get('my-records')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getMyAttendanceHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceRecordQueryDto,
  ) {
    return this.attendanceService.getMyAttendanceHistory(user, query);
  }

  /**
   * List paginated attendance sessions with filters.
   * Rep only.
   */
  @Get('instances')
  @Roles(UserRole.REP)
  async getAttendanceInstances(@Query() query: AttendanceInstanceQueryDto) {
    return this.attendanceService.getAttendanceInstances(query);
  }

  /**
   * Retrieve session report with attendee records and statistics.
   * Rep only.
   */
  @Get('instances/:instanceId')
  @Roles(UserRole.REP)
  async getAttendanceByInstance(
    @Param('instanceId') instanceId: string,
    @Query() query: AttendanceRecordQueryDto,
  ) {
    return this.attendanceService.getAttendanceByInstance(instanceId, query);
  }

  /**
   * Stream full session attendance roster as an optimized CSV download.
   * Rep only. Directly streams from the database to avoid massive JSON transfers and frontend memory bloat.
   */
  @Get('instances/:instanceId/export-csv')
  @Roles(UserRole.REP)
  async exportAttendanceCsv(
    @Param('instanceId') instanceId: string,
    @Res() res: Response,
  ) {
    return this.attendanceService.exportAttendanceCsv(instanceId, res);
  }

  /**
   * Cascade delete attendance session and all attendee records.
   * Rep only.
   */
  @Delete('instances/:instanceId')
  @Roles(UserRole.REP)
  async deleteInstance(@Param('instanceId') instanceId: string) {
    return this.attendanceService.deleteInstance(instanceId);
  }

  /**
   * Delete single attendance entry.
   * Rep only.
   */
  @Delete('records/:attendanceId')
  @Roles(UserRole.REP)
  async deleteAttendanceRecord(@Param('attendanceId') attendanceId: string) {
    return this.attendanceService.deleteAttendanceRecord(attendanceId);
  }
}

