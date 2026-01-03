const models = require("../../config/models");
const sequelize = require("../../config/db"); // Required for transaction
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const { shuffle, generatedId } = require("../../services/customServices");
const { sendGroupAssignmentEmail } = require("../../services/customEmails");

async function processCustomGroups(job) {
  const { studentsPerGroup, isGeneral, courseId, socketId } = job.data;

  try {
    if (!studentsPerGroup || studentsPerGroup < 1) {
      throw new Error("Invalid students per group count");
    }

    await emitWorkerEvent("jobStarted", {
      jobType: "processCustomGroups",
      message: "Initializing group creation...",
      courseId,
      socketId,
    });

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 10,
      message: "Verifying course and students...",
      socketId,
    });

    let studentIDs = [];

    if (isGeneral) {
      const studentRows = await models.Student.findAll({
        attributes: ["id"],
        where: { status: "active" },
        raw: true,
      });
      studentIDs = studentRows;
    } else {
      const courseExists = await models.Course.findByPk(courseId);
      if (!courseExists) {
        throw new Error("Course with provided courseId does not exist");
      }

      const courseStudents = await models.CourseStudent.findAll({
        where: { courseId },
        attributes: ["studentId"],
        raw: true,
      });

      studentIDs = courseStudents.map((cs) => ({ id: cs.studentId }));
    }

    if (!studentIDs.length) {
      throw new Error("No students found to group");
    }

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 30,
      message: "Shuffling students...",
      socketId,
    });

    const shuffledStudents = await shuffle(studentIDs);

    const emailQueue = [];
    let totalGroups = 0;

    await sequelize.transaction(async (transaction) => {
      let currentGroupNumber = 1;
      let processedStudents = 0;

      for (let i = 0; i < shuffledStudents.length; i += studentsPerGroup) {
        const groupChunk = shuffledStudents.slice(i, i + studentsPerGroup);
        const groupName = `GROUP ${currentGroupNumber}`;
        const groupId = await generatedId("GRP");

        await models.Group.create(
          {
            id: groupId,
            name: groupName,
            courseId: isGeneral ? null : courseId,
            description: groupName,
            isGeneral,
          },
          { transaction }
        );

        const memberRecords = groupChunk.map((student, idx) => ({
          groupId,
          studentId: student.id,
          isLeader: idx === 0,
        }));

        await models.GroupMember.bulkCreate(memberRecords, { transaction });

        emailQueue.push({
          groupName,
          members: groupChunk,
        });

        processedStudents += groupChunk.length;
        const progress =
          30 + Math.floor((processedStudents / shuffledStudents.length) * 50);

        if (currentGroupNumber % 5 === 0) {
          await emitWorkerEvent("jobProgress", {
            jobType: "processCustomGroups",
            progress: progress,
            message: `Created ${groupName}...`,
            socketId,
          });
        }

        currentGroupNumber++;
        totalGroups++;
      }
    });

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 90,
      message: "Sending notifications...",
      socketId,
    });

    await Promise.allSettled(
      emailQueue.map((item) =>
        sendGroupAssignmentEmail(item.groupName, item.members).catch((err) =>
          console.error(`Failed email for ${item.groupName}:`, err.message)
        )
      )
    );

    await emitWorkerEvent("jobComplete", {
      jobType: "processCustomGroups",
      message: `Successfully created ${totalGroups} groups!`,
      socketId,
    });
  } catch (error) {
    console.error("Group Creation Failed:", error);

    await emitWorkerEvent("jobFailed", {
      jobType: "processCustomGroups",
      courseId,
      error: error.message || "Unknown error occurred",
      socketId,
    });

    throw error;
  }
}

module.exports = { processCustomGroups };
