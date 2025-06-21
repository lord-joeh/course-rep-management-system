const { connect } = require('../config/db');
const { generatedId } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.addNotification = async (req, res) => {
  let client;
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 409, 'Title and message are required');
    }
    client = await connect();

    const id = await generatedId('NTF');

    const newNotification = await client.query(
      `INSERT INTO notification (id, title, message)
            VALUES ($1, $2, $3)
            RETURNING *`,
      [id, title, message],
    );
    return handleResponse(
      res,
      201,
      'Notification added successfully',
      newNotification.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error adding notification', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.allNotification = async (req, res) => {
  let client;
  try {
    client = await connect();

    const notifications = await client.query(
      `SELECT * FROM notification
            ORDER BY created_at DESC`,
    );
    if (!notifications.rows.length) {
      return handleError(res, 409, 'No notifications found');
    }

    return handleResponse(
      res,
      200,
      'Notifications retrieved successfully',
      notifications.rows,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving notifications', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.notificationById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    const notification = await client.query(
      `SELECT * FROM notification WHERE id = $1`,
      [id],
    );
    if (!notification.rows.length) {
      return handleError(res, 404, 'Notification not found');
    }

    return handleResponse(
      res,
      200,
      'Notification retrieved successfully',
      notification.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving notification', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.updateNotification = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 409, 'Title and message are required');
    }
    client = await connect();
    const updatedNotification = await client.query(
      `UPDATE notification
            SET title = $1,
                message = $2
                WHERE id = $3
                RETURNING *`,
      [title, message, id],
    );
    if (!updatedNotification.rows.length) {
      return handleError(res, 404, 'Notification not found');
    }

    return handleResponse(
      res,
      200,
      'Notification updated successfully',
      updatedNotification.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating notification', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteNotification = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();
    await client.query(`DELETE FROM notification WHERE id = $1`, [id]);

    return handleResponse(res, 200, 'Notification deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting notification', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};
