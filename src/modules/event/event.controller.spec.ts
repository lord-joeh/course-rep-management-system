import { Test, TestingModule } from '@nestjs/testing';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { CreateEventDto, UpdateEventDto, EventQueryDto } from './dto';
import { EventType } from './entities/event.entity';

describe('EventController', () => {
  let controller: EventController;
  let serviceMock: {
    createEvent: jest.Mock;
    getEvents: jest.Mock;
    getUpcomingEvents: jest.Mock;
    getEventsBySeries: jest.Mock;
    getEventById: jest.Mock;
    updateEvent: jest.Mock;
    cancelEvent: jest.Mock;
    cancelSeries: jest.Mock;
    deleteEvent: jest.Mock;
    deleteSeries: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serviceMock = {
      createEvent: jest.fn(),
      getEvents: jest.fn(),
      getUpcomingEvents: jest.fn(),
      getEventsBySeries: jest.fn(),
      getEventById: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
      cancelSeries: jest.fn(),
      deleteEvent: jest.fn(),
      deleteSeries: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventController],
      providers: [
        {
          provide: EventService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createEvent', () => {
    it('should call service.createEvent with given dto', async () => {
      const dto: CreateEventDto = {
        title: 'CSC 301 Lecture',
        venue: 'Hall 1',
        startDate: '2026-11-01T10:00:00Z',
        endDate: '2026-11-01T12:00:00Z',
        eventType: EventType.LECTURE,
      };
      serviceMock.createEvent.mockResolvedValue({ id: 'evt-1', ...dto });

      const result = await controller.createEvent(dto);

      expect(serviceMock.createEvent).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('evt-1');
    });
  });

  describe('getEvents', () => {
    it('should call service.getEvents with query parameters', async () => {
      const query: EventQueryDto = {
        page: 1,
        limit: 10,
        courseId: 'CSC101',
      };
      serviceMock.getEvents.mockResolvedValue({
        items: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      const result = await controller.getEvents(query);

      expect(serviceMock.getEvents).toHaveBeenCalledWith(query);
      expect(result.items).toEqual([]);
    });
  });

  describe('getUpcomingEvents', () => {
    it('should call service.getUpcomingEvents with specified limit', async () => {
      serviceMock.getUpcomingEvents.mockResolvedValue([
        { id: 'evt-1', title: 'Midterm' },
      ]);

      const result = await controller.getUpcomingEvents(5);

      expect(serviceMock.getUpcomingEvents).toHaveBeenCalledWith(5);
      expect(result).toHaveLength(1);
    });
  });

  describe('getEventsBySeries', () => {
    it('should retrieve events belonging to series', async () => {
      serviceMock.getEventsBySeries.mockResolvedValue([
        { id: 'evt-1', recurrenceSeriesId: 'series-uuid-1' },
      ]);

      const result = await controller.getEventsBySeries('series-uuid-1');

      expect(serviceMock.getEventsBySeries).toHaveBeenCalledWith(
        'series-uuid-1',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getEventById', () => {
    it('should retrieve single event by ID', async () => {
      serviceMock.getEventById.mockResolvedValue({
        id: 'evt-1',
        title: 'Seminar',
      });

      const result = await controller.getEventById('evt-1');

      expect(serviceMock.getEventById).toHaveBeenCalledWith('evt-1');
      expect(result.id).toBe('evt-1');
    });
  });

  describe('updateEvent', () => {
    it('should update event with provided dto', async () => {
      const dto: UpdateEventDto = { title: 'Renamed Seminar' };
      serviceMock.updateEvent.mockResolvedValue({
        id: 'evt-1',
        title: 'Renamed Seminar',
      });

      const result = await controller.updateEvent('evt-1', dto);

      expect(serviceMock.updateEvent).toHaveBeenCalledWith('evt-1', dto);
      expect(result.title).toBe('Renamed Seminar');
    });
  });

  describe('cancelEvent', () => {
    it('should cancel single event occurrence', async () => {
      serviceMock.cancelEvent.mockResolvedValue({
        message: 'Event successfully cancelled',
        id: 'evt-1',
      });

      const result = await controller.cancelEvent('evt-1');

      expect(serviceMock.cancelEvent).toHaveBeenCalledWith('evt-1');
      expect(result.message).toContain('successfully cancelled');
    });
  });

  describe('cancelSeries', () => {
    it('should cancel future occurrences in recurring series', async () => {
      serviceMock.cancelSeries.mockResolvedValue({
        message: 'Series future events successfully cancelled',
        seriesId: 'series-uuid-1',
        affected: 4,
      });

      const result = await controller.cancelSeries('series-uuid-1');

      expect(serviceMock.cancelSeries).toHaveBeenCalledWith(
        'series-uuid-1',
      );
      expect(result.affected).toBe(4);
    });
  });

  describe('deleteSeries', () => {
    it('should permanently delete recurring series', async () => {
      serviceMock.deleteSeries.mockResolvedValue({
        message: 'Recurring series successfully deleted',
        seriesId: 'series-uuid-1',
      });

      const result = await controller.deleteSeries('series-uuid-1');

      expect(serviceMock.deleteSeries).toHaveBeenCalledWith(
        'series-uuid-1',
      );
      expect(result.message).toContain('successfully deleted');
    });
  });

  describe('deleteEvent', () => {
    it('should permanently delete single event', async () => {
      serviceMock.deleteEvent.mockResolvedValue({
        message: 'Event successfully deleted',
      });

      const result = await controller.deleteEvent('evt-1');

      expect(serviceMock.deleteEvent).toHaveBeenCalledWith('evt-1');
      expect(result.message).toContain('successfully deleted');
    });
  });
});
