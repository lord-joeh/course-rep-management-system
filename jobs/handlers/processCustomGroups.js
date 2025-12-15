const models = require("../../config/models");
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const { shuffle, generatedId } = require("../../services/customServices");
const { sendGroupAssignmentEmail } = require("../../services/customEmails");

async function processCustomGroups(job) {
  const { studentsPerGroup, isGeneral, courseId, socketId, userId } = job.data;
  try {
    await emitWorkerEvent("jobStarted", {
      jobType: "processCustomGroups",
      message: "Creating Group(s)",
      courseId,
      socketId,
    });

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 10,
      message: "Verifying course...",
      socketId,
    });

    // If course-specific, verify the course exists
    if (!isGeneral) {
      const courseExists = await models.Course.findByPk(courseId);
      if (!courseExists) {
        Error("Course with provided courseId does not exist");
      }
    }

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 25,
      message: "Fetching student IDs...",
      socketId,
    });

    // Fetch student IDs depending on whether group is general or course-specific
    let studentList = [];
    if (isGeneral) {
      const studentRows = await models.Student.findAll({ attributes: ["id"] });
      studentList = studentRows.map((s) => ({ id: s?.id }));
    } else {
      // Only include students that are enrolled in the provided course
      const courseStudents = await models.CourseStudent.findAll({
        where: { courseId },
        attributes: ["studentId"],
      });
      if (!courseStudents.length) {
        Error("No students found for the provided course");
      }
      studentList = courseStudents.map((cs) => ({ id: cs?.studentId }));
    }

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 35,
      message: "Shuffling student IDs...",
      socketId,
    });

    // Shuffle the array of student objects
    const studentIDs = await shuffle(studentList);
    if (!studentIDs.length) {
       Error("No students found in Database");
    }

    await emitWorkerEvent("jobProgress", {
      jobType: "processCustomGroups",
      progress: 50,
      message: "Creating groups...",
      socketId,
    });

    let currentGroupNumber = 1;
    let totalGroups = 0;
    const totalStudents = studentIDs.length;
    let processedStudents = 0;

    for (let i = 0; i < studentIDs.length; i += studentsPerGroup) {
      const groupName = `GROUP ${currentGroupNumber}`;
      const groupId = await generatedId("GRP");

      await models.Group.create({
        id: groupId,
        name: groupName,
        courseId: isGeneral ? null : courseId,
        description: groupName,
        isGeneral,
      });

      const group = studentIDs.slice(i, i + studentsPerGroup);

      await Promise.all(
        group.map(async (student, idx) => {
          const isLeader = idx === 0;
          await models.GroupMember.create({
            groupId,
            studentId: student.id,
            isLeader,
          });
        })
      );

      processedStudents += group.length;

      const groupProgress =
        50 + Math.floor((processedStudents / totalStudents) * 45);

      try {
        await emitWorkerEvent("jobProgress", {
          jobType: "processCustomGroups",
          progress: groupProgress,
          message: `Created ${groupName}, queueing emails...`,
          socketId,
        });

        await sendGroupAssignmentEmail(groupName, group);
      } catch (emailErr) {
        console.error(
          `Failed to send assignment emails for ${groupName}:`,
          emailErr
        );
      }

      currentGroupNumber += 1;
      totalGroups += 1;
    }

    await emitWorkerEvent("jobComplete", {
      jobType: "processCustomGroups",
      message: `All ${totalGroups} group(s) created successfully!`,
      socketId,
    });


  } catch (error) {
    await emitWorkerEvent("jobFailed", {
      jobType: "processCustomGroups",
      courseId,
      error: error.message,
      socketId,
    });

    throw error;
  }
}

module.exports = { processCustomGroups };
