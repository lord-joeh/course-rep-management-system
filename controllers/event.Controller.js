const models = require("../config/models");
const { generatedId } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const SocketMessagingService = require("../services/socketMessaging");

exports.addEvent = async (req, res) => {
  try {
    const { description, date, time, venue } = req.body;
    if (!description || !date || !time || !venue) {
      return handleError(
        res,
        400,
        "Description, date, time, and venue are required"
      );
    }

    const id = await generatedId("EVT");
    const newEvent = await models.Event.create({
      id,
      description,
      date,
      time,
      venue,
    });

    const studentsToNotify = await models.Student.findAll({
      attributes: ["id"],
    });

    if (studentsToNotify && studentsToNotify.length > 0) {
      try {
        // Extract student IDs from the objects
        const studentIds = studentsToNotify.map((student) => student?.id);
        SocketMessagingService.notifyEventChange(studentIds, null, "created");
        console.log(
          "📤 Event notification sent to",
          studentIds.length,
          "students"
        );
      } catch (error) {
        console.error("❌ Failed to send event notification:", error);
      }
    }

    return handleResponse(res, 201, "Event added successfully", newEvent);
  } catch (error) {
    return handleError(res, 500, "Error adding event", error);
  }
};

exports.getAllEvent = async (req, res) => {
  try {
    const events = await models.Event.findAll({
      order: [
        ["createdAt", "DESC"],
      ],
    });
    if (!events.length) {
      return handleError(res, 404, "No Events found");
    }
    return handleResponse(res, 200, "Events retrieved successfully", events);
  } catch (error) {
    return handleError(res, 500, "Error retrieving events", error);
  }
};

exports.eventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await models.Event.findByPk(id);
    if (!event) {
      return handleError(res, 404, "Event not found");
    }
    return handleResponse(res, 200, "Event retrieved successfully", event);
  } catch (error) {
    return handleError(res, 500, "Error retrieving event", error);
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, date, time, venue } = req.body;
    if (!description || !date || !time || !venue) {
      return handleError(
        res,
        409,
        "Description, date, time, and venue are required"
      );
    }
    const [updated] = await models.Event.update(
      { description, date, time, venue },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, "Event not found for update");
    }
    const updatedEvent = await models.Event.findByPk(id);
    return handleResponse(res, 200, "Event updated successfully", updatedEvent);
  } catch (error) {
    return handleError(res, 500, "Error updating event", error);
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Event.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Event not found for deletion");
    }
    return handleResponse(res, 200, "Event deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting event", error);
  }
};
