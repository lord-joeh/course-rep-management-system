const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const models = require("../../config/models");
const { generatedId, generateQR } = require("../../services/customServices");
const jwt = require("jsonwebtoken");
const { getDistance } = require("geolib");
const sequelize = require("../../config/db");
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const { UnrecoverableError } = require("bullmq");

exports.processAttendanceCreation = async (job) => {
  const { courseId, date, classType, latitude, longitude, socketId } = job.data;

  try {
    await emitWorkerEvent("jobStarted", {
      jobType: "processAttendanceCreation",
      message: "Initializing...",
      socketId,
    });

    const instanceId = await generatedId("ATT_INT");

    const qrTokenExpiration = new Date(Date.now() + 60 * 60 * 1000); // Token valid for 1 hour

    const qrToken = jwt.sign(
      { courseId, instanceId, classType, latitude, longitude },
      process.env.JWT_SECRET,
      { expiresIn: "1hr" }
    );

    const qrImage = await generateQR(
      `${process.env.FRONTEND_URL}/mark?instanceId=${instanceId}&token=${qrToken}`
    );

    const students = await models.CourseStudent.findAll({
      where: { courseId },
      include: [{ model: models.Student, where: { status: "active" } }],
      raw: true,
    });

    const attendanceRecords = await Promise.all(
      students.map(async (cs) => ({
        id: await generatedId("ATT"),
        instanceId,
        courseId,
        date,
        studentId: cs.studentId || cs["Student.id"],
        status: "absent",
      }))
    );

    await sequelize.transaction(async (transaction) => {
      await models.AttendanceInstance.create(
        {
          id: instanceId,
          courseId,
          date,
          qr_token: qrToken,
          qr_image: qrImage,
          expires_at: qrTokenExpiration,
          latitude: latitude || 0,
          longitude: longitude || 0,
          class_type: classType,
        },
        { transaction }
      );

      await models.Attendance.bulkCreate(attendanceRecords, {
        transaction,
      });
    });

    await emitWorkerEvent("jobComplete", {
      jobType: "processAttendanceCreation",
      message: "Attendance session is live!",
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
  const { studentId, instance, latitude, longitude, socketId } = job.data;

  try {
    await emitWorkerEvent("jobStarted", {
      jobType: "processAttendanceMarking",
      message: "Verifying details...",
      socketId,
    });

    let locationValid = true;
    let locationMessage = "Verified";

    if (instance.class_type === "in-person") {
      if (!latitude || !longitude)
        throw new UnrecoverableError("Location access is required");

      const distance = getDistance(
        { latitude: instance.latitude, longitude: instance.longitude },
        { latitude, longitude }
      );

      if (distance > 50) {
        locationValid = false;
        locationMessage = `Too far from classroom. You are ${distance}m away.`;
      }
    }

    if (!locationValid) {
      await models.SecurityLog.create({
        student_id: studentId,
        instance_id: instance.id,
        event_type: "location_verification_failed",
        details: locationMessage,
      });
      throw new UnrecoverableError(locationMessage);
    }

    await sequelize.transaction(async (transaction) => {
      const [updatedRows] = await models.Attendance.update(
        {
          status: "present",
          updatedAt: new Date(),
        },
        {
          where: {
            instanceId: instance.id,
            studentId,
            status: "absent",
          },
          transaction,
        }
      );

      if (updatedRows === 0) {
        const exists = await models.Attendance.findOne({
          where: { instanceId: instance.id, studentId },
          transaction,
        });

        if (exists) throw new UnrecoverableError("Attendance already marked");

        const newId = await generatedId("ATT");
        await models.Attendance.create(
          {
            id: newId,
            instanceId: instance.id,
            courseId: instance.courseId,
            date: instance.date,
            studentId,
            status: "present",
          },
          { transaction }
        );
      }

      await models.AttendanceLog.create(
        {
          student_id: studentId,
          instance_id: instance.id,
          location_checked: instance.class_type === "in-person",
          location_valid: locationValid,
          details: locationMessage,
        },
        { transaction }
      );
    });

    await emitWorkerEvent("jobComplete", {
      jobType: "processAttendanceMarking",
      message: "Attendance Marked Successfully",
      socketId,
    });
  } catch (error) {
    await emitWorkerEvent("jobFailed", {
      jobType: "processAttendanceMarking",
      message: error.message || "Unknown Error",
      socketId: socketId || job.data.socketId,
    });

    throw error;
  }
};
