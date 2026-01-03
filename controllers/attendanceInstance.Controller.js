const models = require("../config/models");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const jwt = require("jsonwebtoken");
const { client } = require("../config/redis");
let redisKey = `attendance-instance-page=${1}-limit=${10}`;
const { enqueue } = require("../services/enqueue");

exports.attendanceInstance = async (req, res) => {
  try {
    const { courseId, date, classType, latitude, longitude } = req.body;
    const socketId = req.socketId;
    if (!courseId || !date || !classType) {
      return handleError(
        res,
        409,
        "Course ID, date, and class type are required"
      );
    }

    if (!["in-person", "online"].includes(classType)) {
      return handleError(
        res,
        400,
        'Invalid class type. Must be "in-person" or "online"'
      );
    }

    if (classType === "in-person" && (!latitude || !longitude)) {
      return handleError(
        res,
        400,
        "Location coordinates are required for in-person classes"
      );
    }

    console.log("Passed to queue");

    enqueue("processAttendanceCreation", {
      ...req.body,
      socketId,
    });

    await client.del(redisKey);
    res.status(200).json({
      success: true,
      message: "Attendance initialization queued",
    });
  } catch (error) {
    handleError(res, 500, "Error initializing attendance", error);
  }
};

exports.closeAttendance = async (req, res) => {
  try {
    const { instanceId } = req.query;
    if (!instanceId) {
      return handleError(res, 400, "Instance ID required");
    }
    const instance = await models.AttendanceInstance.findByPk(instanceId);
    if (!instance) {
      return handleError(res, 404, "Attendance not found");
    }
    if (instance.is_close) {
      return handleError(res, 400, "Attendance already closed");
    }
    instance.is_close = true;
    instance.qr_token = "";
    await instance.save();

    await client.del(redisKey);
    return handleResponse(res, 200, "Attendance successfully closed");
  } catch (error) {
    return handleError(res, 500, "Error closing attendance", error);
  }
};

exports.allAttendanceInstance = async (req, res) => {
  try {
    const { page = 1, limit = 5, courseId, date, classType } = req.query;
    const offset = (page - 1) * limit;
    redisKey = `attendance-instance-page=${page}-limit=${limit}`;

    const cachedInstance = await client.get(redisKey);
    if (cachedInstance) {
      return handleResponse(
        res,
        200,
        "Instances successfully retrieved",
        JSON.parse(cachedInstance)
      );
    }

    let where = {};
    if (courseId) {
      where.courseId = courseId;
    }
    if (date) {
      where.date = date;
    }
    if (classType) {
      where.class_type = classType;
    }

    const { count, rows: instances } =
      await models.AttendanceInstance.findAndCountAll({
        where,
        limit: Number(limit),
        offset: Number(offset),
        order: [["createdAt", "DESC"]],
      });

    if (!instances) {
      return handleError(res, 400, "No instance was found");
    }

    const totalPages = Math.ceil(count / limit);

    await client.set(
      redisKey,
      JSON.stringify({
        instance: instances,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalItems: count,
          itemsPerPage: Number(limit),
        },
      }),
      "EX",
      3600
    );

    return handleResponse(res, 200, "Instances successfully retrieved", {
      instance: instances,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalItems: count,
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    return handleError(
      res,
      500,
      "Error retrieving attendance instances",
      error
    );
  }
};

exports.deleteInstance = async (req, res) => {
  try {
    const { instanceId } = req.params;
    const deleted = await models.AttendanceInstance.destroy({
      where: { id: instanceId },
    });

    if (!deleted) {
      return handleError(res, 404, "Instance not found for deletion");
    }

    await models.Attendance.destroy({ where: { instanceId } });

    await client.del(redisKey);
    return handleResponse(
      res,
      200,
      "Instance and all related attendance deleted successfully"
    );
  } catch (error) {
    return handleError(res, 500, "Error deleting attendance instance", error);
  }
};

exports.attendanceByInstance = async (req, res) => {
  try {
    const { page = 1, limit = 10, studentId } = req.query;
    const offset = (page - 1) * limit;
    const { instanceId } = req.params;

    let where = {
      instanceId,
    };
    if (studentId) where.studentId = studentId;

    const { count, rows: attendances } =
      await models.Attendance.findAndCountAll({
        where,
        include: [{ model: models.Student, attributes: ["name"] }],
        limit: Number(limit),
        offset: Number(offset),
        order: [["date", "DESC"]],
        includes: [],
      });

    const presentCount = await models.Attendance.count({
      where: {
        instanceId,
        status: "present",
      },
    });

    const totalPages = Math.ceil(count / limit);

    return handleResponse(res, 200, "Attendance fetched successfully", {
      attendance: attendances,
      presentCount,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalItems: count,
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    return handleError(res, 500, "Error retrieving attendance", error);
  }
};

exports.updateAttendeeStatus = async (req, res) => {
  try {
    const { attendanceId, studentId } = req.query;
    if (!attendanceId || !studentId) {
      return handleError(res, 400, "Missing data to update attendee status");
    }
    const attendance = await models.Attendance.findOne({
      where: { id: attendanceId, studentId },
    });
    if (!attendance) {
      return handleError(res, 404, "Attendee not found");
    }
    attendance.status = "present";
    await attendance.save();
    return handleResponse(res, 202, "Attendance successfully marked");
  } catch (error) {
    return handleError(res, 500, "Error updating attendee", error);
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const deleted = await models.Attendance.destroy({
      where: { id: attendanceId },
    });
    if (!deleted) {
      return handleError(res, 404, "Attendance not found for deletion");
    }
    return handleResponse(res, 200, "Attendance deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting attendance", error);
  }
};

exports.autoAttendanceMark = async (req, res) => {
  try {
    console.log(req.body);
    const { token, studentId } = req.query;
    const socketId = req?.socketId ?? "";

    if (!studentId || !token) {
      return handleError(res, 400, "Student ID and token are required");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.instanceId || !decoded.courseId || !decoded.classType) {
      return handleError(res, 400, "Invalid attendance token payload");
    }

    const instance = await models.AttendanceInstance.findOne({
      where: { id: decoded.instanceId, courseId: decoded.courseId },
    });

    if (!instance) {
      return handleError(res, 404, "Attendance session not found");
    }

    if (instance.is_close) {
      return handleError(res, 410, "Attendance session is closed");
    }

    if (new Date(instance.expires_at) < new Date()) {
      return handleError(res, 410, "Attendance session has expired");
    }

    if (instance.qr_token !== token) {
      return handleError(res, 401, "Invalid attendance token");
    }

    enqueue("processAttendanceMarking", {
      ...req.body,
      studentId,
      instance,
      socketId,
    });

    return handleResponse(
      res,
      200,
      `Attendance queued successfully for marking. `
    );
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return handleError(res, 401, "Attendance token has expired");
    }

    if (error.name === "JsonWebTokenError") {
      return handleError(res, 401, "Invalid attendance token");
    }

    return handleError(res, 500, "Error marking attendance", error);
  }
};
