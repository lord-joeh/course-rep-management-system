const eventController = require('../../controllers/event.Controller');
const models = require('../../config/models');
const { generatedId } = require('../../services/customServices');
const { handleError } = require('../../services/errorService');
const { handleResponse } = require('../../services/responseService');

jest.mock('../../config/models', () => ({
  Event: {
    create: jest.fn(),
  },
}));

jest.mock('../../services/customServices', () => ({
  generatedId: jest.fn(),
}));

jest.mock('../../services/errorService', () => ({
  handleError: jest.fn(),
}));

jest.mock('../../services/responseService', () => ({
  handleResponse: jest.fn(),
}));

describe('Event Controller - addEvent', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('Validation failures', () => {
    it('should return 400 if description is missing', async () => {
      req.body = { date: '2023-01-01', time: '10:00', venue: 'Room A' };
      await eventController.addEvent(req, res);
      expect(handleError).toHaveBeenCalledWith(res, 400, 'Description, date, time, and venue are required');
    });

    it('should return 400 if date is missing', async () => {
      req.body = { description: 'Meeting', time: '10:00', venue: 'Room A' };
      await eventController.addEvent(req, res);
      expect(handleError).toHaveBeenCalledWith(res, 400, 'Description, date, time, and venue are required');
    });

    it('should return 400 if time is missing', async () => {
      req.body = { description: 'Meeting', date: '2023-01-01', venue: 'Room A' };
      await eventController.addEvent(req, res);
      expect(handleError).toHaveBeenCalledWith(res, 400, 'Description, date, time, and venue are required');
    });

    it('should return 400 if venue is missing', async () => {
      req.body = { description: 'Meeting', date: '2023-01-01', time: '10:00' };
      await eventController.addEvent(req, res);
      expect(handleError).toHaveBeenCalledWith(res, 400, 'Description, date, time, and venue are required');
    });
  });

  it('should create an event and return 201 on success', async () => {
    req.body = { description: 'Meeting', date: '2023-01-01', time: '10:00', venue: 'Room A' };
    generatedId.mockResolvedValue('EVT123');
    const createdEvent = { id: 'EVT123', ...req.body };
    models.Event.create.mockResolvedValue(createdEvent);

    await eventController.addEvent(req, res);

    expect(generatedId).toHaveBeenCalledWith('EVT');
    expect(models.Event.create).toHaveBeenCalledWith({
      id: 'EVT123',
      description: 'Meeting',
      date: '2023-01-01',
      time: '10:00',
      venue: 'Room A',
    });
    expect(handleResponse).toHaveBeenCalledWith(res, 201, 'Event added successfully', createdEvent);
  });

  it('should return 500 if an error occurs during generatedId', async () => {
    req.body = { description: 'Meeting', date: '2023-01-01', time: '10:00', venue: 'Room A' };
    const error = new Error('ID generation failed');
    generatedId.mockRejectedValue(error);

    await eventController.addEvent(req, res);

    expect(handleError).toHaveBeenCalledWith(res, 500, 'Error adding event', error);
  });

  it('should return 500 if an error occurs during creation', async () => {
    req.body = { description: 'Meeting', date: '2023-01-01', time: '10:00', venue: 'Room A' };
    const error = new Error('Database error');
    generatedId.mockResolvedValue('EVT123');
    models.Event.create.mockRejectedValue(error);

    await eventController.addEvent(req, res);

    expect(handleError).toHaveBeenCalledWith(res, 500, 'Error adding event', error);
  });
});
