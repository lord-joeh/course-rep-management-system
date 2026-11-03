import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailJobType } from './constants';

@Controller('admin/queues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('REP')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats() {
    const stats = await this.queueService.getQueueStats();
    return {
      message: 'Queue operational metrics retrieved successfully',
      stats,
    };
  }

  @Post('email/test')
  @HttpCode(HttpStatus.OK)
  async sendTestEmail(
    @CurrentUser() user: any,
    @Body('to') to?: string,
  ) {
    const recipient = to || user.email;
    const jobId = await this.queueService.sendEmail(
      EmailJobType.STUDENT_MESSAGE,
      {
        to: recipient,
        name: user.name || 'Course Rep',
        subject: 'Course Rep Queue Verification Test',
        message: 'This is a test notification confirming your BullMQ background queue is operating cleanly.',
      },
    );

    return {
      message: 'Test email job successfully enqueued',
      jobId,
      recipient,
    };
  }

  @Post('sms/test')
  @HttpCode(HttpStatus.OK)
  async sendTestSms(
    @CurrentUser() user: any,
    @Body('to') to: string,
    @Body('message') message?: string,
  ) {
    const recipient = to || user.phone;
    const msg = message || 'Course Rep System: Background queue SMS pipeline test.';
    const jobId = await this.queueService.sendSms(recipient, msg, undefined, {
      userId: user.sub || user.id,
    });

    return {
      message: 'Test SMS job successfully enqueued',
      jobId,
      recipient,
    };
  }
}

