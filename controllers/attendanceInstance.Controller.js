const  models  = require("../config/models");
const { generatedId, generateQR } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const jwt = require("jsonwebtoken");
const { getDistance } = require("geolib");

exports.attendanceInstance = async (req, res) => {
  try {
    const { courseId, date, classType, latitude, longitude } = req.body;
    if (!courseId || !date || !classType) {
      return handleError(
        res,
        409,
        "Course ID, date, and class type are required"
      );
    }
    if (!["physical", "online"].includes(classType)) {
      return handleError(
        res,
        400,
        'Invalid class type. Must be "physical" or "online"'
      );
    }
    let lat = latitude || 0;
    let long = longitude || 0;
    if (classType === "physical" && (!latitude || !longitude)) {
      return handleError(
        res,
        400,
        "Location coordinates are required for physical classes"
      );
    }
    const id = await generatedId("ATT_INT");
    const qrTokenExpiration = new Date(Date.now() + 15 * 60 * 1000);
    const tokenPayload = {
      courseId,
      instanceId: id,
      classType,
      latitude: lat,
      longitude: long,
    };
    const qrToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    // Use transaction for atomicity
    const result = await models.sequelize.transaction(async (transaction) => {
      const instance = await models.AttendanceInstance.create({
        id,
        courseId,
        date,
        qr_token: qrToken,
        expires_at: qrTokenExpiration,
        latitude: lat,
        longitude: long,
        class_type: classType,
      }, { transaction });

      // Fetch students
      const students = await models.CourseStudent.findAll({
        where: { courseId },
        include: [{ model: models.Student, where: { status: "active" } }],
        transaction,
      });

      // Generate all attendance IDs in parallel
      const attendanceIds = await Promise.all(
        students.map(() => generatedId("ATT"))
      );

      // Prepare bulk insert data
      const attendanceRecords = students.map((cs, index) => ({
        id: attendanceIds[index],
        instanceId: id,
        courseId,
        date,
        studentId: cs.studentId,
        status: "absent",
      }));

      // Bulk create attendance records
      await models.Attendance.bulkCreate(attendanceRecords, { transaction });

      return instance;
    });

    const attendanceUrl = `${process.env.FRONTEND_URL}/mark?instanceId=${id}&token=${qrToken}`;
    const qrImage = await generateQR(attendanceUrl);
    res.status(201).json({
      success: true,
      message: "Attendance initialized successfully",
      classType,
      qrCode: qrImage,
      data: result,
    });
  } catch (error) {
    handleError(res, 500, "Error initializing attendance", error);
  }
};

exports.closeAttendance = async (req, res) => {
  try {
    const { instanceId } = req.query;
    if (!instanceId) {
      return handleError(res, 409, "Instance ID required");
    }
    const instance = await models.AttendanceInstance.findByPk(instanceId);
    if (!instance) {
      return handleError(res, 404, "Attendance not found");
    }
    if (instance.is_close) {
      return handleError(res, 401, "Attendance already closed");
    }
    instance.is_close = true;
    instance.qr_token = "";
    await instance.save();
    return handleResponse(res, 200, "Attendance successfully closed");
  } catch (error) {
    return handleError(res, 500, "Error closing attendance", error);
  }
};

exports.allAttendanceInstance = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: instances } = await models.AttendanceInstance.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    if (!instances.length) {
      return handleError(res, 400, "No instance was found");
    }

    const totalPages = Math.ceil(count / limit);

    return handleResponse(
      res,
      200,
      "Instances successfully retrieved",
      {
        instances,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
        },
      }
    );
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
    return handleResponse(
      res,
      200,
      "Instance and all related attendance deleted successfully"
    );
  } catch (error) {
    return handleError(res, 500, "Error deleting attendance instance", error);
  }
};

exports.attendanceByQuery = async (req, res) => {
  try {
    const { date, studentId, courseId } = req.query;
    const where = {};
    if (date) where.date = date;
    if (studentId) where.studentId = studentId;
    if (courseId) where.courseId = courseId;
    const attendances = await models.Attendance.findAll({
      where,
      order: [["date", "DESC"]],
    });
    return handleResponse(
      res,
      200,
      "Attendance fetched successfully",
      attendances
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving attendance", error);
  }
};

exports.updateAttendeeStatus = async (req, res) => {
  try {
    const { attendanceId, studentId } = req.query;
    if (!attendanceId || !studentId) {
      return handleError(res, 409, "Missing data to update attendee status");
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
    const { studentId } = req.body;
    const { token } = req.query;

    if (!studentId || !token) {
      return handleError(res, 409, "Student ID and token are required");
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

    // Location verification logic
    let locationRequired = false;
    let locationValid = false;
    let locationMessage = "";

    if (instance.class_type === "physical") {
      locationRequired = true;

      if (!req.body.latitude || !req.body.longitude) {
        return handleError(res, 409, "Location coordinates are required");
      }

      const distance = getDistance(
        { latitude: instance.latitude, longitude: instance.longitude },
        { latitude: req.body.latitude, longitude: req.body.longitude }
      );

      locationValid = distance <= 50;

      locationMessage = locationValid
        ? "Location verified"
        : `You must be within 50m of the classroom (${distance}m away)`;
    } else if (instance.class_type === "online") {
      if (Math.random() < 0.2) {
        locationRequired = true;

        if (!req.body.latitude || !req.body.longitude) {
          return handleError(res, 409, "Random location check required");
        }

        locationValid = true;
        locationMessage = "Random location check completed";
      }
    }
    if (locationRequired && !locationValid) {
      await models.SecurityLog.create({
        student_id: studentId,
        instance_id: instance.id,
        event_type: "location_verification_failed",
        details: locationMessage,
      });

      return handleError(res, 403, locationMessage);
    }
    // Use transaction for attendance marking operations
    await models.sequelize.transaction(async (transaction) => {
      // Check existing attendance status
      const attendance = await models.Attendance.findOne({
        where: { instanceId: decoded.instanceId, studentId },
        transaction,
      });

      if (attendance?.status === "present") {
        throw new Error("Attendance already marked");
      }

      if (attendance) {
        attendance.status = "present";
        await attendance.save({ transaction });
      } else {
        const id = await generatedId("ATT");

        await models.Attendance.create({
          id,
          instanceId: decoded.instanceId,
          courseId: decoded.courseId,
          date: new Date(),
          studentId,
          status: "present",
        }, { transaction });
      }

      await models.AttendanceLog.create({
        student_id: studentId,
        instance_id: instance.id,
        location_checked: locationRequired,
        location_valid: locationValid,
        details: locationMessage,
      }, { transaction });
    });

    return handleResponse(
      res,
      200,
      `Attendance marked successfully. ${locationMessage}`
    );
  } catch (error) {
    return handleError(res, 500, "Error marking attendance", error);
  }
};
