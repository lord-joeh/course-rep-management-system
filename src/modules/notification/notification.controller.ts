import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationQueryDto,
  RegisterFcmTokenDto,
  DirectNotificationDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Broadcast a new cohort or course announcement.
   * Course Rep only.
   */
  @Post()
  @Roles(UserRole.REP)
  async createNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationService.createNotification(user.id, dto);
  }

  /**
   * List paginated notifications with personal read receipt status.
   */
  @Get()
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getNotifications(user.id, query);
  }

  /**
   * Get unread notification count for app badge.
   */
  @Get('unread-count')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.getUnreadCount(user.id);
  }

  /**
   * Bulk mark all unread notifications as read.
   */
  @Patch('read-all')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.markAllAsRead(user.id);
  }

  /**
   * Register or refresh device FCM push token.
   */
  @Post('push-token')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async registerFcmToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    return this.notificationService.registerFcmToken(user.id, dto);
  }

  /**
   * Send direct targeted notification to a specific student.
   * Course Rep only.
   */
  @Post('direct')
  @Roles(UserRole.REP)
  async sendDirectNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DirectNotificationDto,
  ) {
    return this.notificationService.sendDirectNotification(user.id, dto);
  }

  /**
   * Retrieve single notification details with personal read state.
   */
  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getNotificationById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.getNotificationById(id, user.id);
  }

  /**
   * Update announcement details.
   * Course Rep only.
   */
  @Put(':id')
  @Roles(UserRole.REP)
  async updateNotification(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationService.updateNotification(id, dto);
  }

  /**
   * Permanently delete an announcement.
   * Course Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteNotification(@Param('id') id: string) {
    return this.notificationService.deleteNotification(id);
  }

  /**
   * Mark single notification as read.
   */
  @Patch(':id/read')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationService.markAsRead(id, user.id);
  }
}
