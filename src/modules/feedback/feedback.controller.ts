import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import {
  CreateFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto';
import { PaginationQueryDto } from '../../common/pagination';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

@Controller('feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * Submit new feedback/suggestion with IDOR protection.
   */
  @Post()
  @Roles(UserRole.STUDENT, UserRole.REP)
  async createFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.createFeedback(user.id, dto);
  }

  /**
   * List paginated feedback with filters & anonymous identity masking.
   * Course Reps only.
   */
  @Get()
  @Roles(UserRole.REP)
  async getFeedbacks(@Query() query: FeedbackQueryDto) {
    return this.feedbackService.getFeedbacks(query);
  }

  /**
   * Retrieve personal feedback submissions for current student.
   */
  @Get('my-feedback')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getMyFeedbacks(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.feedbackService.getMyFeedbacks(
      user.id,
      query.page,
      query.limit,
    );
  }

  /**
   * Retrieve single feedback entry with privacy controls and ownership check.
   */
  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getFeedbackById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedbackService.getFeedbackById(id, user);
  }

  /**
   * Triage and update feedback status with Rep response.
   * Course Reps only.
   */
  @Patch(':id/status')
  @Roles(UserRole.REP)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.feedbackService.updateStatus(id, user.id, dto);
  }

  /**
   * Permanently delete a feedback item.
   * Course Reps only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteFeedback(@Param('id') id: string) {
    return this.feedbackService.deleteFeedback(id);
  }
}
