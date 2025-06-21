const { connect } = require('../config/db');
const {
  generatedId,
  formatDateAndTime,
} = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.addEvent = async (req, res) => {
  let client;
  try {
    const { title, description, date, time, venue } = req.body;
    client = await connect();

    if (!title || !description || !date || !time || !venue) {
      return handleError(
        res,
        409,
        'Title, description, date, time, and venue are required',
      );
    }

    const id = await generatedId('EVT');
    const { formattedDate, formattedTime } = formatDateAndTime(date, time);
    const newEvent = await client.query(
      `INSERT INTO event (id, title, description, date, time, venue)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
      [id, title, description, formattedDate, formattedTime, venue],
    );

    return handleResponse(
      res,
      201,
      'Event added successfully',
      newEvent.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error adding event', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.getAllEvent = async (req, res) => {
  let client;
  try {
    client = await connect();

    const events = await client.query(
      `SELECT 
        id,
        title,
        description,
        date,
        time,
        venue,
        created_at
        FROM event
        ORDER BY date DESC, time DESC;`,
    );
    if (!events.rows.length) {
      return handleError(res, 404, 'No Events found');
    }

    return handleResponse(
      res,
      200,
      'Events retrieved successfully',
      events.rows,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving events', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.eventById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    const event = await client.query(
      `SELECT * FROM event
        WHERE id = $1`,
      [id],
    );

    if (!event.rows.length) {
      return handleError(res, 404, 'Event not found');
    }

    return handleResponse(
      res,
      200,
      'Event retrieved successfully',
      event.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving event', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.updateEvent = async (req, res) => {
  let client;
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
    client = await connect();

    const updatedEvent = await client.query(
      `UPDATE event SET 
        title = $1,
        description = $2,
        date = $3,
        time = $4,
        venue = $5
        WHERE id = $6
        RETURNING *;`,
      [title, description, formattedDate, formattedTime, venue, id],
    );

    if (!updatedEvent.rows.length) {
      return handleError(res, 404, 'Event not found for update');
    }

    return handleResponse(
      res,
      200,
      'Event updated successfully',
      updatedEvent.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating event', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteEvent = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    await client.query(`DELETE FROM event WHERE id = $1`, [id]);
    return handleResponse(res, 200, 'Event deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting event', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};
