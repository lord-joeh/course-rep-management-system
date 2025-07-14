const { Notification } = require('../config/db');
const { generatedId } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.addNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 409, 'Title and message are required');
    }
    const id = await generatedId('NTF');
    const newNotification = await Notification.create({ id, title, message });
    return handleResponse(
      res,
      201,
      'Notification added successfully',
      newNotification,
    );
  } catch (error) {
    return handleError(res, 500, 'Error adding notification', error);
  }
};

exports.allNotification = async (req, res) => {
  try {
    const notifications = await Notification.findAll({ order: [['created_at', 'DESC']] });
    if (!notifications.length) {
      return handleError(res, 409, 'No notifications found');
    }
    return handleResponse(
      res,
      200,
      'Notifications retrieved successfully',
      notifications,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving notifications', error);
  }
};

exports.notificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByPk(id);
    if (!notification) {
      return handleError(res, 404, 'Notification not found');
    }
    return handleResponse(
      res,
      200,
      'Notification retrieved successfully',
      notification,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving notification', error);
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 409, 'Title and message are required');
    }
    const notification = await Notification.findByPk(id);
    if (!notification) {
      return handleError(res, 404, 'Notification not found');
    }
    notification.title = title;
    notification.message = message;
    await notification.save();
    return handleResponse(
      res,
      200,
      'Notification updated successfully',
      notification,
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating notification', error);
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, 'Notification not found');
    }
    return handleResponse(res, 200, 'Notification deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting notification', error);
  }
};
