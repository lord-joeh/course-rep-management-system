const { generatedId } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const models = require("../config/models");
const { enqueue } = require("../services/enqueue");
const { getEmitter } = require("../middleware/socketIO"); // Import Socket Emitter

exports.addNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return handleError(res, 400, "Title and message are required");
    }
    const id = await generatedId("NTF");
    const newNotification = await models.Notification.create({
      id,
      title,
      message,
    });

    // Emit real-time event to all connected clients
    try {
      const io = getEmitter();
      io.emit("newNotification", newNotification);
    } catch (socketError) {
      console.error("Failed to emit notification event:", socketError);
    }

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
    console.log(req.student)
    const userId = req?.student.id; 
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { rows: notifications, count: totalItems } =
      await models.Notification.findAndCountAll({
        limit,
        offset,
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: models.Student,
            as: "Readers",
            attributes: ["id"],
            where: { id: userId },
            required: false, 
            through: { attributes: [] }, 
          },
        ],
        distinct: true, 
      });

    const processedNotifications = notifications.map((n) => {
      const json = n.toJSON();
      return {
        ...json,
        isRead: json.Readers && json.Readers.length > 0, 
        Readers: undefined, 
      };
    });

    const totalPages = Math.ceil(totalItems / limit);

    return handleResponse(res, 200, "Notifications retrieved", {
      notifications: processedNotifications,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    return handleError(res, 500, "Error retrieving notifications", error);
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.student.id;

    const notification = await models.Notification.findByPk(id);
    if (!notification) return handleError(res, 404, "Notification not found");

    const existingRead = await models.NotificationRead.findOne({
      where: { notificationId: id, studentId },
    });

    if (!existingRead) {
      await models.NotificationRead.create({
        notificationId: id,
        studentId,
        isRead: true,
      });
    }

    return handleResponse(res, 200, "Marked as read");
  } catch (error) {
    return handleError(res, 500, "Error marking notification as read", error);
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const studentId = req.student.id;
    const allNotifications = await models.Notification.findAll({
      attributes: ["id"],
    });

    const readsToCreate = allNotifications.map((n) => ({
      notificationId: n.id,
      studentId,
      isRead: true,
    }));

    await models.NotificationRead.bulkCreate(readsToCreate, {
      ignoreDuplicates: true,
    });

    return handleResponse(res, 200, "All notifications marked as read");
  } catch (error) {
    return handleError(res, 500, "Error marking all as read", error);
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
  const socketId = req.socketId;
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

    const student = await models.Student.findByPk(studentId, {
      attributes: ["phone", "email"],
    });

    if (!student) return handleError(res, 400, "Student does not exist");

    if (messageType === "email") {
      const subject = "Urgent!";
      // Enqueue Email Job
      await enqueue("sendEmail", {
        to: student.email,
        subject,
        message,
        socketId,
      });
      return handleResponse(res, 200, "Message queued for sending");
    }
    if (messageType === "SMS") {
      // Enqueue SMS job
      await enqueue("sendSMS", {
        to: student.phone,
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
