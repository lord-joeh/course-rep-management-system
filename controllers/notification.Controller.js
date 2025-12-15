const { generatedId } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const models = require("../config/models");
const { enqueue } = require("../services/enqueue");

exports.addNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 409, "Title and message are required");
    }
    const id = await generatedId("NTF");
    const newNotification = await models.Notification.create({
      id,
      title,
      message,
    });
    return handleResponse(
      res,
      201,
      "Notification added successfully",
      newNotification
    );
  } catch (error) {
    return handleError(res, 500, "Error adding notification", error);
  }
};

exports.allNotification = async (req, res) => {
  try {
    const notifications = await models.Notification.findAll({
      order: [["created_at", "DESC"]],
    });
    if (!notifications) {
      return handleError(res, 409, "No notifications found");
    }
    return handleResponse(
      res,
      200,
      "Notifications retrieved successfully",
      notifications
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving notifications", error);
  }
};

exports.notificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await models.Notification.findByPk(id);
    if (!notification) {
      return handleError(res, 404, "Notification not found");
    }
    return handleResponse(
      res,
      200,
      "Notification retrieved successfully",
      notification
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving notification", error);
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 409, "Title and message are required");
    }
    const notification = await models.Notification.findByPk(id);
    if (!notification) {
      return handleError(res, 404, "Notification not found");
    }
    notification.title = title;
    notification.message = message;
    await notification.save();
    return handleResponse(
      res,
      200,
      "Notification updated successfully",
      notification
    );
  } catch (error) {
    return handleError(res, 500, "Error updating notification", error);
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Notification.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Notification not found");
    }
    return handleResponse(res, 200, "Notification deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting notification", error);
  }
};

exports.sendNotificationToStudent = async (req, res) => {
  const { message, studentId, messageType } = req.body;
  const socketId = req.body.socketId || req.headers["x-socket-id"] || null;
  try {
    if (!studentId)
      return handleError(res, 400, "Student ID is required to send message");
    if (!message)
      return handleError(res, 400, "You can not send an empty message");
    if (!messageType)
      return handleError(
        res,
        400,
        "Type of message is required to send message"
      );

    const { dataValues } = await models.Student.findByPk(studentId, {
      attributes: ["phone", "email"],
    });
    if (!dataValues) return handleError(res, 400, "Student does not exist");
    console.log(dataValues);
    if (messageType === "email") {
      const subject = "Urgent!";
      await sendEmail({
        to: dataValues?.email,
        subject,
        message,

      });
      return handleResponse(res, 200, "Message queued for sending");
    }
    if (messageType === "SMS") {
      // Enqueue the SMS job
      await enqueue("sendSMS", {
        to: dataValues?.phone,
        message,
        socketId,
        studentId,
      });
      return handleResponse(res, 200, "Message queued for sending");
    }
  } catch (error) {
    return handleError(res, 500, "Error sending message", error);
  }
};
