import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { EventService } from './event.service';
import {
  Event,
  EventType,
  RecurrenceFrequency,
} from './entities/event.entity';
import { Course } from '../course/entities/course.entity';
import { CacheService } from '../redis/cache.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';

describe('EventService', () => {
  let service: EventService;
  let eventRepoMock: any;
  let courseRepoMock: any;
  let cacheServiceMock: any;
  let dataSourceMock: any;
  let managerMock: any;
  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    };

    eventRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'event-uuid-1', ...entity }),
      ),
      remove: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue({ affected: 5 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    courseRepoMock = {
      findOne: jest.fn(),
    };

    managerMock = {
      create: jest.fn((entityClass: any, dto: any) => ({ ...dto })),
      save: jest.fn((entityClass: any, entity: any) => {
        if (Array.isArray(entity)) {
          return Promise.resolve(
            entity.map((e, idx) => ({ id: `occ-uuid-${idx + 1}`, ...e })),
          );
        }
        return Promise.resolve({ id: 'tx-event-uuid', ...entity });
      }),
    };

    dataSourceMock = {
      transaction: jest.fn((cb: any) => cb(managerMock)),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      scanAndInvalidate: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: getRepositoryToken(Event), useValue: eventRepoMock },
        { provide: getRepositoryToken(Course), useValue: courseRepoMock },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: CacheService, useValue: cacheServiceMock },
        {
          provide: NotificationDispatcherService,
          useValue: {
            dispatchAcademicEventCreated: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
  });

  describe('calculateOccurrences', () => {
    it('should calculate daily occurrences with interval', () => {
      const start = new Date('2026-11-01T10:00:00Z');
      const end = new Date('2026-11-01T12:00:00Z');

      const occurrences = service.calculateOccurrences(start, end, {
        title: 'Daily Meeting',
        venue: 'Room 101',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.DAILY,
        recurrenceInterval: 2,
        recurrenceCount: 3,
      });

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].startDate).toEqual(start);
      expect(occurrences[1].startDate).toEqual(
        new Date('2026-11-03T10:00:00Z'),
      );
      expect(occurrences[2].startDate).toEqual(
        new Date('2026-11-05T10:00:00Z'),
      );
    });

    it('should calculate weekly occurrences without specific days', () => {
      const start = new Date('2026-11-01T09:00:00Z');
      const end = new Date('2026-11-01T11:00:00Z');

      const occurrences = service.calculateOccurrences(start, end, {
        title: 'Weekly Lecture',
        venue: 'Hall A',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.WEEKLY,
        recurrenceInterval: 1,
        recurrenceCount: 2,
      });

      expect(occurrences).toHaveLength(2);
      expect(occurrences[1].startDate).toEqual(
        new Date('2026-11-08T09:00:00Z'),
      );
    });

    it('should calculate weekly occurrences with recurrenceDaysOfWeek', () => {
      // 2026-11-02 is Monday (day 1)
      const start = new Date('2026-11-02T14:00:00Z');
      const end = new Date('2026-11-02T16:00:00Z');

      const occurrences = service.calculateOccurrences(start, end, {
        title: 'Mon & Wed Lab',
        venue: 'Lab 1',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.WEEKLY,
        recurrenceDaysOfWeek: [1, 3], // Monday and Wednesday
        recurrenceCount: 3,
      });

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].startDate.getDay()).toBe(1);
      expect(occurrences[1].startDate.getDay()).toBe(3);
    });

    it('should calculate biweekly and monthly occurrences', () => {
      const start = new Date('2026-11-01T10:00:00Z');
      const end = new Date('2026-11-01T12:00:00Z');

      const biweekly = service.calculateOccurrences(start, end, {
        title: 'Biweekly Seminar',
        venue: 'Hall B',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.BIWEEKLY,
        recurrenceCount: 2,
      });

      expect(biweekly).toHaveLength(2);
      expect(biweekly[1].startDate).toEqual(
        new Date('2026-11-15T10:00:00Z'),
      );

      const monthly = service.calculateOccurrences(start, end, {
        title: 'Monthly Assembly',
        venue: 'Auditorium',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.MONTHLY,
        recurrenceCount: 2,
      });

      expect(monthly).toHaveLength(2);
      expect(monthly[1].startDate.getMonth()).toBe(11); // December
    });

    it('should respect recurrenceEndDate boundary', () => {
      const start = new Date('2026-11-01T10:00:00Z');
      const end = new Date('2026-11-01T12:00:00Z');
      const cutoff = new Date('2026-11-05T00:00:00Z');

      const occurrences = service.calculateOccurrences(start, end, {
        title: 'Cutoff Test',
        venue: 'Room 1',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.DAILY,
        recurrenceEndDate: cutoff.toISOString(),
      });

      // Days: Nov 1, Nov 2, Nov 3, Nov 4 (Nov 5 is cutoff boundary)
      expect(occurrences.length).toBeLessThanOrEqual(5);
      occurrences.forEach((occ) => {
        expect(occ.startDate.getTime()).toBeLessThanOrEqual(cutoff.getTime());
      });
    });
  });

  describe('checkVenueCollision', () => {
    it('should return conflicting event when venue is already booked', async () => {
      const conflictingEvent = {
        id: 'evt-existing',
        title: 'Existing Lecture',
        venue: 'Hall 1',
      };
      queryBuilderMock.getOne.mockResolvedValue(conflictingEvent);

      const result = await service.checkVenueCollision(
        'Hall 1',
        new Date('2026-11-01T10:00:00Z'),
        new Date('2026-11-01T12:00:00Z'),
      );

      expect(result).toEqual(conflictingEvent);
      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'LOWER(e.venue) = LOWER(:venue)',
        { venue: 'Hall 1' },
      );
    });

    it('should exclude current event ID when checking update collision', async () => {
      await service.checkVenueCollision(
        'Hall 1',
        new Date('2026-11-01T10:00:00Z'),
        new Date('2026-11-01T12:00:00Z'),
        'evt-current-id',
      );

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'e.id != :excludeId',
        { excludeId: 'evt-current-id' },
      );
    });
  });

  describe('createEvent', () => {
    it('should throw BadRequestException if endDate is not strictly after startDate', async () => {
      await expect(
        service.createEvent({
          title: 'Invalid Event',
          venue: 'Room 1',
          startDate: '2026-11-01T12:00:00Z',
          endDate: '2026-11-01T10:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.createEvent({
          title: 'Course Event',
          venue: 'Room 1',
          courseId: 'CSC999',
          startDate: '2026-11-01T10:00:00Z',
          endDate: '2026-11-01T12:00:00Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if single event venue collides and allowOverlap is false', async () => {
      queryBuilderMock.getOne.mockResolvedValue({
        id: 'evt-c',
        title: 'Clashing Session',
      });

      await expect(
        service.createEvent({
          title: 'Clashing Event',
          venue: 'Lab 1',
          startDate: '2026-11-01T10:00:00Z',
          endDate: '2026-11-01T12:00:00Z',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create single event successfully when no collision exists', async () => {
      queryBuilderMock.getOne.mockResolvedValue(null);

      const result = await service.createEvent({
        title: 'Physics Revision',
        venue: 'LT 2',
        startDate: '2026-11-01T14:00:00Z',
        endDate: '2026-11-01T16:00:00Z',
        eventType: EventType.TUTORIAL,
      });

      expect(eventRepoMock.create).toHaveBeenCalled();
      expect(eventRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
      expect(result.id).toBe('event-uuid-1');
    });

    it('should create single event with allowOverlap = true bypassing collision check', async () => {
      const result = await service.createEvent({
        title: 'Combined Assembly',
        venue: 'Main Hall',
        startDate: '2026-11-01T14:00:00Z',
        endDate: '2026-11-01T16:00:00Z',
        allowOverlap: true,
      });

      expect(queryBuilderMock.getOne).not.toHaveBeenCalled();
      expect(result.id).toBe('event-uuid-1');
    });

    it('should throw BadRequestException if recurring event lacks recurrenceFrequency', async () => {
      await expect(
        service.createEvent({
          title: 'Recurring Without Freq',
          venue: 'LT 1',
          startDate: '2026-11-01T10:00:00Z',
          endDate: '2026-11-01T12:00:00Z',
          isRecurring: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if recurrenceEndDate is before startDate', async () => {
      await expect(
        service.createEvent({
          title: 'Invalid Recurring End',
          venue: 'LT 1',
          startDate: '2026-11-01T10:00:00Z',
          endDate: '2026-11-01T12:00:00Z',
          isRecurring: true,
          recurrenceFrequency: RecurrenceFrequency.WEEKLY,
          recurrenceEndDate: '2026-10-31T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if any occurrence in recurring series collides', async () => {
      queryBuilderMock.getOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          title: 'Future Clashing Lecture',
          startDate: new Date('2026-11-08T10:00:00Z'),
        });

      await expect(
        service.createEvent({
          title: 'Recurring Lecture',
          venue: 'Lab 2',
          startDate: '2026-11-01T10:00:00Z',
          endDate: '2026-11-01T12:00:00Z',
          isRecurring: true,
          recurrenceFrequency: RecurrenceFrequency.WEEKLY,
          recurrenceCount: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should transactionally persist recurring series when valid', async () => {
      queryBuilderMock.getOne.mockResolvedValue(null);

      const result = await service.createEvent({
        title: 'Weekly Seminar Series',
        venue: 'Room 303',
        startDate: '2026-11-01T10:00:00Z',
        endDate: '2026-11-01T12:00:00Z',
        isRecurring: true,
        recurrenceFrequency: RecurrenceFrequency.WEEKLY,
        recurrenceCount: 3,
        recurrenceEndDate: '2026-12-01T00:00:00Z',
      });

      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
      expect(result.totalOccurrences).toBe(3);
      expect(result.recurrenceSeriesId).toBeDefined();
    });
  });

  describe('getEvents', () => {
    it('should return cached paginated result if present in cache', async () => {
      const cached = {
        items: [{ id: 'evt-cached-1' }],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.getEvents({ page: 1, limit: 10 });

      expect(result).toEqual(cached);
      expect(eventRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query and apply all filters on cache miss', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([
        [{ id: 'evt-1', title: 'Calculus' }],
        1,
      ]);

      const result = await service.getEvents({
        courseId: 'CSC101',
        isGeneral: false,
        eventType: EventType.LECTURE,
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-30T00:00:00Z',
        upcomingOnly: true,
        recurrenceSeriesId: 'series-uuid-1',
        search: 'Calculus',
        page: 1,
        limit: 10,
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'e.course_id = :courseId',
        { courseId: 'CSC101' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'e.course_id IS NOT NULL',
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'e.event_type = :eventType',
        { eventType: EventType.LECTURE },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'e.recurrence_series_id = :seriesId',
        { seriesId: 'series-uuid-1' },
      );
      expect(cacheServiceMock.set).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });

    it('should filter general cohort events when isGeneral is true', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getEvents({ isGeneral: true, page: 1, limit: 10 });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'e.course_id IS NULL',
      );
    });
  });

  describe('getUpcomingEvents', () => {
    it('should retrieve next upcoming events up to limit', async () => {
      queryBuilderMock.getMany.mockResolvedValue([
        { id: 'evt-1', title: 'Upcoming 1' },
      ]);

      const result = await service.getUpcomingEvents(3);

      expect(queryBuilderMock.take).toHaveBeenCalledWith(3);
      expect(result).toHaveLength(1);
    });
  });

  describe('getEventsBySeries', () => {
    it('should throw NotFoundException if series contains no events', async () => {
      eventRepoMock.find.mockResolvedValue([]);

      await expect(
        service.getEventsBySeries('non-existent-series'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return all occurrences for a recurring series', async () => {
      eventRepoMock.find.mockResolvedValue([
        { id: 'evt-1', recurrenceSeriesId: 'series-1' },
        { id: 'evt-2', recurrenceSeriesId: 'series-1' },
      ]);

      const result = await service.getEventsBySeries('series-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('getEventById', () => {
    it('should throw NotFoundException if event does not exist', async () => {
      eventRepoMock.findOne.mockResolvedValue(null);

      await expect(service.getEventById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return event details with course relation', async () => {
      const event = { id: 'evt-1', title: 'Orientation' };
      eventRepoMock.findOne.mockResolvedValue(event);

      const result = await service.getEventById('evt-1');

      expect(result).toEqual(event);
    });
  });

  describe('updateEvent', () => {
    it('should throw NotFoundException if event does not exist', async () => {
      eventRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateEvent('invalid-id', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if updated endDate <= startDate', async () => {
      const existing = {
        id: 'evt-1',
        startDate: new Date('2026-11-01T10:00:00Z'),
        endDate: new Date('2026-11-01T12:00:00Z'),
      };
      eventRepoMock.findOne.mockResolvedValue(existing);

      await expect(
        service.updateEvent('evt-1', {
          endDate: '2026-11-01T08:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if updated venue/dates collide', async () => {
      const existing = {
        id: 'evt-1',
        venue: 'Hall 1',
        startDate: new Date('2026-11-01T10:00:00Z'),
        endDate: new Date('2026-11-01T12:00:00Z'),
      };
      eventRepoMock.findOne.mockResolvedValue(existing);
      queryBuilderMock.getOne.mockResolvedValue({
        id: 'evt-other',
        title: 'Collision',
      });

      await expect(
        service.updateEvent('evt-1', {
          venue: 'Hall 2',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if updated courseId not found', async () => {
      const existing = {
        id: 'evt-1',
        venue: 'Hall 1',
        startDate: new Date('2026-11-01T10:00:00Z'),
        endDate: new Date('2026-11-01T12:00:00Z'),
      };
      eventRepoMock.findOne.mockResolvedValue(existing);
      queryBuilderMock.getOne.mockResolvedValue(null);
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateEvent('evt-1', {
          courseId: 'INVALID_COURSE',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update single event and unset courseId if passed empty', async () => {
      const existing = {
        id: 'evt-1',
        venue: 'Hall 1',
        courseId: 'CSC101',
        startDate: new Date('2026-11-01T10:00:00Z'),
        endDate: new Date('2026-11-01T12:00:00Z'),
      };
      eventRepoMock.findOne.mockResolvedValue(existing);
      queryBuilderMock.getOne.mockResolvedValue(null);
      eventRepoMock.save.mockImplementation((e: any) => Promise.resolve(e));

      const updated = await service.updateEvent('evt-1', {
        title: 'Updated Title',
        description: 'Updated Desc',
        eventType: EventType.EXAM,
        venue: 'Hall 3',
        meetingLink: 'https://meet.google.com/abc',
        courseId: '',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.courseId).toBeNull();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
    });

    it('should propagate changes to future occurrences in series when updateFutureInSeries is true', async () => {
      const existing = {
        id: 'evt-1',
        title: 'Old Title',
        venue: 'Hall 1',
        recurrenceSeriesId: 'series-uuid-1',
        startDate: new Date('2026-11-01T10:00:00Z'),
        endDate: new Date('2026-11-01T12:00:00Z'),
      };
      eventRepoMock.findOne.mockResolvedValue(existing);
      courseRepoMock.findOne.mockResolvedValue({ id: 'CSC201' });
      queryBuilderMock.getOne.mockResolvedValue(null);
      eventRepoMock.save.mockImplementation((e: any) => Promise.resolve(e));

      await service.updateEvent('evt-1', {
        title: 'New Series Title',
        courseId: 'CSC201',
        updateFutureInSeries: true,
      });

      expect(queryBuilderMock.update).toHaveBeenCalled();
      expect(queryBuilderMock.execute).toHaveBeenCalled();
    });
  });

  describe('cancelEvent', () => {
    it('should throw NotFoundException if event does not exist', async () => {
      eventRepoMock.findOne.mockResolvedValue(null);

      await expect(service.cancelEvent('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should mark single event as cancelled and invalidate cache', async () => {
      const existing = { id: 'evt-1', isCancelled: false };
      eventRepoMock.findOne.mockResolvedValue(existing);

      const result = await service.cancelEvent('evt-1');

      expect(existing.isCancelled).toBe(true);
      expect(eventRepoMock.save).toHaveBeenCalledWith(existing);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
      expect(result.id).toBe('evt-1');
    });
  });

  describe('cancelSeries', () => {
    it('should throw NotFoundException if no future events affected in series', async () => {
      queryBuilderMock.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.cancelSeries('empty-or-past-series'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should mark future events in series as cancelled', async () => {
      queryBuilderMock.execute.mockResolvedValue({ affected: 4 });

      const result = await service.cancelSeries('series-1');

      expect(result.affected).toBe(4);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
    });
  });

  describe('deleteEvent', () => {
    it('should throw NotFoundException if event not found', async () => {
      eventRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteEvent('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should remove event and invalidate cache', async () => {
      const existing = { id: 'evt-1' };
      eventRepoMock.findOne.mockResolvedValue(existing);

      const result = await service.deleteEvent('evt-1');

      expect(eventRepoMock.remove).toHaveBeenCalledWith(existing);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
      expect(result.message).toContain('successfully deleted');
    });
  });

  describe('deleteSeries', () => {
    it('should throw NotFoundException if no events deleted in series', async () => {
      eventRepoMock.delete.mockResolvedValue({ affected: 0 });

      await expect(
        service.deleteSeries('non-existent-series'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete recurring series and invalidate cache', async () => {
      eventRepoMock.delete.mockResolvedValue({ affected: 5 });

      const result = await service.deleteSeries('series-1');

      expect(result.seriesId).toBe('series-1');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:events:*',
      );
    });
  });
});
