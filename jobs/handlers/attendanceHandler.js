const models = require("../../config/models");
const { generatedId, generateQR } = require("../../services/customServices");
const jwt = require("jsonwebtoken");
const { getDistance } = require("geolib");
const sequelize = require("../../config/db");
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");

exports.processAttendanceCreation = async (job) => {
  await emitWorkerEvent("jobStarted", {
    jobType: "processAttendanceCreation",
    message: "Initializing Attendance Instance...",
    socketId,
  });

  try {
    const { courseId, date, classType, latitude, longitude, socketId } =
      job.data;
    let lat = latitude || 0;
    let long = longitude || 0;

    await emitWorkerEvent("jobProgress", {
      jobType: "processAttendanceCreation",
      progress: 15,
      message: "Creating token payload...",
      socketId,
    });

    const id = await generatedId("ATT_INT");
    const qrTokenExpiration = new Date(Date.now() + 60 * 60 * 1000);
    const tokenPayload = {
      courseId,
      instanceId: id,
      classType,
      latitude: lat,
      longitude: long,
    };

    await emitWorkerEvent("jobProgress", {
      jobType: "processAttendanceCreation",
      progress: 35,
      message: "Signing token payload...",
      socketId,
    });

    const qrToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "1hr",
    });

    await emitWorkerEvent("jobProgress", {
      jobType: "processAttendanceCreation",
      progress: 50,
      message: "Generating QR CODE...",
      socketId,
    });

    const attendanceUrl = `${process.env.FRONTEND_URL}/mark?instanceId=${id}&token=${qrToken}`;
    const qrImage = await generateQR(attendanceUrl);

    const result = await sequelize.transaction(async (transaction) => {
      const instance = await models.AttendanceInstance.create(
        {
          id,
          courseId,
          date,
          qr_token: qrToken,
          qr_image: qrImage,
          expires_at: qrTokenExpiration,
          latitude: lat,
          longitude: long,
          class_type: classType,
        },
        { transaction }
      );

      await emitWorkerEvent("jobProgress", {
        jobType: "processAttendanceCreation",
        progress: 75,
        message: "Fetching students...",
        socketId,
      });

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

      await emitWorkerEvent("jobProgress", {
        jobType: "processAttendanceCreation",
        progress: 85,
        message: "Writing data...",
        socketId,
      });

      // Prepare bulk insert data
      const attendanceRecords = students.map((cs, index) => ({
        id: attendanceIds[index],
        instanceId: id,
        courseId,
        date,
        studentId: cs?.studentId,
        status: "absent",
      }));

      await emitWorkerEvent("jobProgress", {
        jobType: "processAttendanceCreation",
        progress: 85,
        message: "Creating record...",
        socketId,
      });

      await models.Attendance.bulkCreate(attendanceRecords, { transaction });

      return instance;
    });

    await emitWorkerEvent("jobComplete", {
      jobType: "processAttendanceCreation",
      message: "Attendance created successfully",
      result,
      socketId,
    });
  } catch (error) {
    await emitWorkerEvent("jobFailed", {
      jobType: "processAttendanceCreation",
      error: error.message,
      socketId,
    });

    throw error;
  }
};

exports.processAttendanceMarking = async (job) => {
  try {
    const { studentId, instance, latitude, longitude, socketId } = job.data;

    await emitWorkerEvent("jobStarted", {
      jobType: "processAttendanceMarking",
      message: "Marking Attendance...",
      socketId,
    });

    // Location verification logic
    let locationRequired = false;
    let locationValid = false;
    let locationMessage = "";

    await emitWorkerEvent("jobProgress", {
      jobType: "processAttendanceMarking",
      progress: 25,
      message: "Verifying Location...",
      socketId,
    });

    if (instance.class_type === "in-person") {
      locationRequired = true;

      if (!req.body.latitude || !req.body.longitude) {
        Error("Location coordinates are required");
      }

      const distance = getDistance(
        { latitude: instance.latitude, longitude: instance.longitude },
        { latitude: latitude, longitude: longitude }
      );

      locationValid = distance <= 50;

      locationMessage = locationValid
        ? "Location verified"
        : `You must be within 50m of the classroom (${distance}m away)`;
    } else if (instance.class_type === "online") {
      locationRequired = false;
    }

    await emitWorkerEvent("jobProgress", {
      jobType: "processAttendanceMarking",
      progress: 45,
      message: "Processing Logs...",
      socketId,
    });

    if (locationRequired && !locationValid) {
      await models.SecurityLog.create({
        student_id: studentId,
        instance_id: instance.id,
        event_type: "location_verification_failed",
        details: locationMessage,
      });

      throw new Error(locationMessage);
    }

    await emitWorkerEvent("jobProgress", {
      jobType: "processAttendanceMarking",
      progress: 65,
      message: "Final Marking in progress...",
      socketId,
    });

    await sequelize.transaction(async (transaction) => {
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

        await models.Attendance.create(
          {
            id,
            instanceId: decoded.instanceId,
            courseId: decoded.courseId,
            date: new Date(),
            studentId,
            status: "present",
          },
          { transaction }
        );
      }

      await emitWorkerEvent("jobProgress", {
        jobType: "processAttendanceMarking",
        progress: 85,
        message: "Writing Logs...",
        socketId,
      });

      await models.AttendanceLog.create(
        {
          student_id: studentId,
          instance_id: instance.id,
          location_checked: locationRequired,
          location_valid: locationValid,
          details: locationMessage,
        },
        { transaction }
      );
    });
    await emitWorkerEvent("jobComplete", {
      jobType: "processAttendanceMarking",
      message: "Attendance Marked SuccessFully..",
      socketId,
    });
  } catch (error) {
    await emitWorkerEvent("jobFailed", {
      jobType: "processAttendanceMarking",
      message: error.message,
      socketId,
    });
    throw Error(error.message);
  }
};
