const  models  = require('../config/models');
const { generatedId, formatDateAndTime } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.addEvent = async (req, res) => {
  try {
    const { title, description, date, time, venue } = req.body;
    if (!title || !description || !date || !time || !venue) {
      return handleError(
        res,
        409,
        'Title, description, date, time, and venue are required',
      );
    }
    const id = await generatedId('EVT');
    const { formattedDate, formattedTime } = formatDateAndTime(date, time);
    const newEvent = await models.Event.create({
      id,
      title,
      description,
      date: formattedDate,
      time: formattedTime,
      venue,
    });
    return handleResponse(res, 201, 'Event added successfully', newEvent);
  } catch (error) {
    return handleError(res, 500, 'Error adding event', error);
  }
};

exports.getAllEvent = async (req, res) => {
  try {
    const events = await models.Event.findAll({
      order: [['date', 'DESC'], ['time', 'DESC']],
    });
    if (!events.length) {
      return handleError(res, 404, 'No Events found');
    }
    return handleResponse(res, 200, 'Events retrieved successfully', events);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving events', error);
  }
};

exports.eventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await models.Event.findOne({ where: { id } });
    if (!event) {
      return handleError(res, 404, 'Event not found');
    }
    return handleResponse(res, 200, 'Event retrieved successfully', event);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving event', error);
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, time, venue } = req.body;
    const { formattedDate, formattedTime } = formatDateAndTime(date, time);
    if (!title || !description || !date || !time || !venue) {
      return handleError(
        res,
        409,
        'Title, description, date, time, and venue are required',
      );
    }
    const [updated] = await models.Event.update(
      { title, description, date: formattedDate, time: formattedTime, venue },
      { where: { id }, returning: true },
    );
    if (!updated) {
      return handleError(res, 404, 'Event not found for update');
    }
    const updatedEvent = await models.Event.findOne({ where: { id } });
    return handleResponse(res, 200, 'Event updated successfully', updatedEvent);
  } catch (error) {
    return handleError(res, 500, 'Error updating event', error);
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Event.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, 'Event not found for deletion');
    }
    return handleResponse(res, 200, 'Event deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting event', error);
  }
};
