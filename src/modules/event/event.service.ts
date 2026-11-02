import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

import {
  Event,
  EventType,
  RecurrenceFrequency,
} from './entities/event.entity';
import { Course } from '../course/entities/course.entity';
import { CacheService } from '../redis/cache.service';
import { CreateEventDto, UpdateEventDto, EventQueryDto } from './dto';
import { PaginatedResult } from '../../common/pagination';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Calculate recurring event occurrences based on frequency, interval, days of week, and bounds.
   */
  calculateOccurrences(
    startDate: Date,
    endDate: Date,
    dto: CreateEventDto,
  ): Array<{ startDate: Date; endDate: Date }> {
    const durationMs = endDate.getTime() - startDate.getTime();
    const occurrences: Array<{ startDate: Date; endDate: Date }> = [];
    const maxCount = Math.min(dto.recurrenceCount || 52, 52);
    const cutoffDate = dto.recurrenceEndDate
      ? new Date(dto.recurrenceEndDate)
      : null;
    const interval = Math.max(dto.recurrenceInterval || 1, 1);
    const frequency = dto.recurrenceFrequency || RecurrenceFrequency.WEEKLY;

    // First occurrence is always the base event
    occurrences.push({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    const currentStart = new Date(startDate);

    while (occurrences.length < maxCount) {
      if (frequency === RecurrenceFrequency.DAILY) {
        currentStart.setDate(currentStart.getDate() + interval);
      } else if (frequency === RecurrenceFrequency.WEEKLY) {
        if (
          dto.recurrenceDaysOfWeek &&
          dto.recurrenceDaysOfWeek.length > 0
        ) {
          // Advance day by day until matching one of the target days of week
          let advanced = false;
          let daysSearched = 0;
          while (!advanced && daysSearched < 14) {
            currentStart.setDate(currentStart.getDate() + 1);
            daysSearched++;
            if (dto.recurrenceDaysOfWeek.includes(currentStart.getDay())) {
              advanced = true;
            }
          }
        } else {
          currentStart.setDate(currentStart.getDate() + 7 * interval);
        }
      } else if (frequency === RecurrenceFrequency.BIWEEKLY) {
        currentStart.setDate(currentStart.getDate() + 14 * interval);
      } else if (frequency === RecurrenceFrequency.MONTHLY) {
        currentStart.setMonth(currentStart.getMonth() + interval);
      }

      if (cutoffDate && currentStart > cutoffDate) {
        break;
      }

      const nextOccStart = new Date(currentStart);
      const nextOccEnd = new Date(currentStart.getTime() + durationMs);

      occurrences.push({
        startDate: nextOccStart,
        endDate: nextOccEnd,
      });
    }

    return occurrences;
  }

  /**
   * Check if a venue is already booked for an active event during the requested time slot.
   */
  async checkVenueCollision(
    venue: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ): Promise<Event | null> {
    const qb = this.eventRepository
      .createQueryBuilder('e')
      .where('LOWER(e.venue) = LOWER(:venue)', { venue: venue.trim() })
      .andWhere('e.is_cancelled = false')
      .andWhere('e.start_date < :endDate', { endDate })
      .andWhere('e.end_date > :startDate', { startDate });

    if (excludeId) {
      qb.andWhere('e.id != :excludeId', { excludeId });
    }

    return qb.getOne();
  }

  /**
   * Create a single or recurring event series with collision prevention.
   */
  async createEvent(dto: CreateEventDto): Promise<any> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end <= start) {
      throw new BadRequestException('End date must be strictly after start date');
    }

    if (dto.courseId) {
      const course = await this.courseRepository.findOne({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException(`Course "${dto.courseId}" not found`);
      }
    }

    if (dto.isRecurring) {
      if (!dto.recurrenceFrequency) {
        throw new BadRequestException(
          'recurrenceFrequency is required for recurring events',
        );
      }
      if (dto.recurrenceEndDate && new Date(dto.recurrenceEndDate) <= start) {
        throw new BadRequestException(
          'recurrenceEndDate must be after the start date',
        );
      }

      const occurrences = this.calculateOccurrences(start, end, dto);
      const recurrenceSeriesId = randomUUID();

      // Check collision for each occurrence if overlap is not allowed
      if (!dto.allowOverlap) {
        for (const occ of occurrences) {
          const collision = await this.checkVenueCollision(
            dto.venue,
            occ.startDate,
            occ.endDate,
          );
          if (collision) {
            throw new ConflictException(
              `Venue "${dto.venue}" is already booked for "${collision.title}" on ${occ.startDate.toISOString()}`,
            );
          }
        }
      }

      // Persist all occurrences transactionally
      const savedEvents = await this.dataSource.transaction(
        async (manager) => {
          const entities = occurrences.map((occ) => {
            const timeStr = `${occ.startDate.toISOString().substring(11, 16)} - ${occ.endDate.toISOString().substring(11, 16)}`;
            return manager.create(Event, {
              title: dto.title,
              description: dto.description || null,
              eventType: dto.eventType || EventType.MEETING,
              courseId: dto.courseId || null,
              startDate: occ.startDate,
              endDate: occ.endDate,
              venue: dto.venue,
              meetingLink: dto.meetingLink || null,
              isCancelled: false,
              isRecurring: true,
              recurrenceFrequency: dto.recurrenceFrequency,
              recurrenceInterval: dto.recurrenceInterval || 1,
              recurrenceDaysOfWeek: dto.recurrenceDaysOfWeek || null,
              recurrenceEndDate: dto.recurrenceEndDate
                ? new Date(dto.recurrenceEndDate)
                : null,
              recurrenceCount: dto.recurrenceCount || null,
              recurrenceSeriesId,
              date: occ.startDate,
              time: timeStr,
            });
          });

          return manager.save(Event, entities);
        },
      );

      await this.cacheService.scanAndInvalidate('cr:events:*');

      return {
        totalOccurrences: savedEvents.length,
        recurrenceSeriesId,
        events: savedEvents,
      };
    }

    // Single event creation
    if (!dto.allowOverlap) {
      const collision = await this.checkVenueCollision(
        dto.venue,
        start,
        end,
      );
      if (collision) {
        throw new ConflictException(
          `Venue "${dto.venue}" is already booked for "${collision.title}" during this time slot`,
        );
      }
    }

    const timeStr = `${start.toISOString().substring(11, 16)} - ${end.toISOString().substring(11, 16)}`;
    const event = this.eventRepository.create({
      title: dto.title,
      description: dto.description || null,
      eventType: dto.eventType || EventType.MEETING,
      courseId: dto.courseId || null,
      startDate: start,
      endDate: end,
      venue: dto.venue,
      meetingLink: dto.meetingLink || null,
      isCancelled: false,
      isRecurring: false,
      date: start,
      time: timeStr,
    });

    const saved = await this.eventRepository.save(event);
    await this.cacheService.scanAndInvalidate('cr:events:*');
    return saved;
  }

  /**
   * List paginated events with filters and calendar date ranges.
   */
  async getEvents(query: EventQueryDto): Promise<PaginatedResult<Event>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim();
    const cacheKey = `cr:events:${query.courseId || 'all'}:${query.isGeneral !== undefined ? query.isGeneral : 'all'}:${query.eventType || 'all'}:${query.upcomingOnly !== undefined ? query.upcomingOnly : 'all'}:${query.from || 'none'}:${query.to || 'none'}:${query.recurrenceSeriesId || 'none'}:${page}:${limit}:${search || ''}`;

    const cached = await this.cacheService.get<PaginatedResult<Event>>(cacheKey);
    if (cached) return cached;

    const qb = this.eventRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.course', 'course');

    if (query.courseId) {
      qb.andWhere('e.course_id = :courseId', { courseId: query.courseId });
    }

    if (query.isGeneral !== undefined) {
      if (query.isGeneral) {
        qb.andWhere('e.course_id IS NULL');
      } else {
        qb.andWhere('e.course_id IS NOT NULL');
      }
    }

    if (query.eventType) {
      qb.andWhere('e.event_type = :eventType', { eventType: query.eventType });
    }

    if (query.from) {
      qb.andWhere('e.start_date >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      qb.andWhere('e.end_date <= :to', { to: new Date(query.to) });
    }

    if (query.upcomingOnly) {
      qb.andWhere('e.end_date >= :now AND e.is_cancelled = false', {
        now: new Date(),
      });
    }

    if (query.recurrenceSeriesId) {
      qb.andWhere('e.recurrence_series_id = :seriesId', {
        seriesId: query.recurrenceSeriesId,
      });
    }

    if (search) {
      qb.andWhere(
        '(e.title ILIKE :search OR e.description ILIKE :search OR e.venue ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('e.start_date', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<Event> = {
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
   * Retrieve upcoming non-cancelled academic events.
   */
  async getUpcomingEvents(limit: number = 5): Promise<Event[]> {
    return this.eventRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.course', 'course')
      .where('e.end_date >= :now AND e.is_cancelled = false', {
        now: new Date(),
      })
      .orderBy('e.start_date', 'ASC')
      .take(limit)
      .getMany();
  }

  /**
   * Retrieve all occurrences belonging to a recurring series.
   */
  async getEventsBySeries(seriesId: string): Promise<Event[]> {
    const events = await this.eventRepository.find({
      where: { recurrenceSeriesId: seriesId },
      order: { startDate: 'ASC' },
      relations: ['course'],
    });

    if (events.length === 0) {
      throw new NotFoundException(
        `Recurring series "${seriesId}" not found`,
      );
    }

    return events;
  }

  /**
   * Retrieve a single event by ID.
   */
  async getEventById(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['course'],
    });
    if (!event) {
      throw new NotFoundException(`Event "${id}" not found`);
    }
    return event;
  }

  /**
   * Update an event (with collision detection and optional series propagation).
   */
  async updateEvent(id: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event "${id}" not found`);
    }

    const start = dto.startDate ? new Date(dto.startDate) : event.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : event.endDate;

    if (end <= start) {
      throw new BadRequestException('End date must be strictly after start date');
    }

    const venue = dto.venue || event.venue;

    if (!dto.allowOverlap && (dto.venue || dto.startDate || dto.endDate)) {
      const collision = await this.checkVenueCollision(
        venue,
        start,
        end,
        id,
      );
      if (collision) {
        throw new ConflictException(
          `Venue "${venue}" is already booked for "${collision.title}" during this time slot`,
        );
      }
    }

    if (dto.courseId !== undefined) {
      if (dto.courseId) {
        const course = await this.courseRepository.findOne({
          where: { id: dto.courseId },
        });
        if (!course) {
          throw new NotFoundException(`Course "${dto.courseId}" not found`);
        }
        event.courseId = dto.courseId;
      } else {
        event.courseId = null;
      }
    }

    if (dto.title !== undefined) event.title = dto.title;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.eventType !== undefined) event.eventType = dto.eventType;
    if (dto.venue !== undefined) event.venue = dto.venue;
    if (dto.meetingLink !== undefined) event.meetingLink = dto.meetingLink;
    event.startDate = start;
    event.endDate = end;
    event.date = start;
    event.time = `${start.toISOString().substring(11, 16)} - ${end.toISOString().substring(11, 16)}`;

    const updated = await this.eventRepository.save(event);

    // Propagate updates to future occurrences if requested
    if (dto.updateFutureInSeries && event.recurrenceSeriesId) {
      await this.eventRepository
        .createQueryBuilder()
        .update(Event)
        .set({
          title: event.title,
          description: event.description,
          venue: event.venue,
          meetingLink: event.meetingLink,
          courseId: event.courseId,
        })
        .where('recurrence_series_id = :seriesId AND start_date > :startDate', {
          seriesId: event.recurrenceSeriesId,
          startDate: event.startDate,
        })
        .execute();
    }

    await this.cacheService.scanAndInvalidate('cr:events:*');
    return updated;
  }

  /**
   * Cancel an individual event occurrence.
   */
  async cancelEvent(id: string): Promise<{ message: string; id: string }> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event "${id}" not found`);
    }

    event.isCancelled = true;
    await this.eventRepository.save(event);
    await this.cacheService.scanAndInvalidate('cr:events:*');

    return { message: 'Event successfully cancelled', id };
  }

  /**
   * Cancel all future occurrences in a recurring series.
   */
  async cancelSeries(
    seriesId: string,
  ): Promise<{ message: string; seriesId: string; affected: number }> {
    const result = await this.eventRepository
      .createQueryBuilder()
      .update(Event)
      .set({ isCancelled: true })
      .where('recurrence_series_id = :seriesId AND start_date >= :now', {
        seriesId,
        now: new Date(),
      })
      .execute();

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException(
        `No future events found for series "${seriesId}"`,
      );
    }

    await this.cacheService.scanAndInvalidate('cr:events:*');

    return {
      message: 'Series future events successfully cancelled',
      seriesId,
      affected: result.affected,
    };
  }

  /**
   * Delete an individual event.
   */
  async deleteEvent(id: string): Promise<{ message: string }> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event "${id}" not found`);
    }

    await this.eventRepository.remove(event);
    await this.cacheService.scanAndInvalidate('cr:events:*');

    return { message: 'Event successfully deleted' };
  }

  /**
   * Permanently delete an entire recurring series.
   */
  async deleteSeries(
    seriesId: string,
  ): Promise<{ message: string; seriesId: string }> {
    const result = await this.eventRepository.delete({
      recurrenceSeriesId: seriesId,
    });

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException(
        `Recurring series "${seriesId}" not found`,
      );
    }

    await this.cacheService.scanAndInvalidate('cr:events:*');

    return { message: 'Recurring series successfully deleted', seriesId };
  }
}
