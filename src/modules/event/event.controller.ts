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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { EventService } from './event.service';
import { CreateEventDto, UpdateEventDto, EventQueryDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  /**
   * Create a single or recurring event series.
   * Rep only.
   */
  @Post()
  @Roles(UserRole.REP)
  async createEvent(
    @Body() dto: CreateEventDto,
    @CurrentUser('id') creatorId?: string,
  ) {
    return this.eventService.createEvent(dto, creatorId);
  }

  /**
   * List paginated events with filters and calendar date ranges.
   */
  @Get()
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getEvents(@Query() query: EventQueryDto) {
    return this.eventService.getEvents(query);
  }

  /**
   * Retrieve upcoming non-cancelled academic events.
   */
  @Get('upcoming')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getUpcomingEvents(
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    return this.eventService.getUpcomingEvents(limit);
  }

  /**
   * Retrieve all occurrences belonging to a recurring series.
   */
  @Get('series/:seriesId')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getEventsBySeries(@Param('seriesId') seriesId: string) {
    return this.eventService.getEventsBySeries(seriesId);
  }

  /**
   * Retrieve single event details.
   */
  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.REP)
  async getEventById(@Param('id') id: string) {
    return this.eventService.getEventById(id);
  }

  /**
   * Update an event (with collision detection and optional series propagation).
   * Rep only.
   */
  @Put(':id')
  @Roles(UserRole.REP)
  async updateEvent(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventService.updateEvent(id, dto);
  }

  /**
   * Cancel an individual event occurrence.
   * Rep only.
   */
  @Patch(':id/cancel')
  @Roles(UserRole.REP)
  async cancelEvent(@Param('id') id: string) {
    return this.eventService.cancelEvent(id);
  }

  /**
   * Cancel all future occurrences in a recurring series.
   * Rep only.
   */
  @Patch('series/:seriesId/cancel')
  @Roles(UserRole.REP)
  async cancelSeries(@Param('seriesId') seriesId: string) {
    return this.eventService.cancelSeries(seriesId);
  }

  /**
   * Permanently delete an entire recurring series.
   * Rep only.
   */
  @Delete('series/:seriesId')
  @Roles(UserRole.REP)
  async deleteSeries(@Param('seriesId') seriesId: string) {
    return this.eventService.deleteSeries(seriesId);
  }

  /**
   * Permanently delete an individual event.
   * Rep only.
   */
  @Delete(':id')
  @Roles(UserRole.REP)
  async deleteEvent(@Param('id') id: string) {
    return this.eventService.deleteEvent(id);
  }
}

