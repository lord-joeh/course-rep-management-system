const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const uploadToFolder = require("../../googleServices/uploadToFolder");
const models = require("../../config/models");
const { generatedId } = require("../../services/customServices");
const { enqueue } = require("../../services/enqueue");
const getCourseAssignmentsFolder = require("../../googleServices/getAssignmentsFolder");
const deleteFile = require("../../googleServices/deleteFile"); // Import needed for cleanup

async function uploadSlides(job) {
  const { files, folderId, courseId, socketId } = job.data;

  const successfulUploads = [];
  const failedUploads = [];

  // Notify start
  if (socketId)
    await emitWorkerEvent("uploadProgress", {
      jobType: "uploadSlides",
      status: "start",
      total: files.length,
      socketId,
    });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const uploadRes = await uploadToFolder(folderId, file);

      const slide = await models.Slides.create({
        id: await generatedId("SLD"),
        driveFileID: uploadRes.id,
        fileName: uploadRes.name,
        courseId: courseId,
      });

      successfulUploads.push(slide);

      // Enqueue processing
      await enqueue(
        "processSlides",
        {
          jobType: "uploadSlides",
          slideId: slide.id,
          driveFileID: uploadRes.id,
          courseId,
          socketId,
        },
        { removeOnComplete: { age: 3600 } }
      );

      if (socketId) {
        await emitWorkerEvent("uploadProgress", {
          jobType: "uploadSlides",
          status: "progress",
          current: i + 1,
          total: files.length,
          slide,
          socketId,
        });
      }
    } catch (err) {
      console.error(`Failed to upload slide ${file.originalname}:`, err);
      failedUploads.push({ file: file.originalname, error: err.message });
    }
  }

  // Notify completion
  if (socketId) {
    await emitWorkerEvent("uploadComplete", {
      jobType: "uploadSlides",
      successful: successfulUploads.length,
      failed: failedUploads.length,
      failedItems: failedUploads,
      socketId,
    });
  }

  return { successful: successfulUploads.length, failed: failedUploads.length };
}

async function uploadAssignment(job) {
  const {
    file,
    folderId,
    assignmentId,
    studentId,
    isNewAssignment,
    title,
    description,
    deadline,
    courseId,
    socketId,
  } = job.data;

  // Track created resources for rollback
  let createdFolderId = null;

  if (studentId && assignmentId && !isNewAssignment) {
    try {
      if (socketId)
        await emitWorkerEvent("uploadProgress", {
          jobType: "uploadAssignment",
          status: "start",
          total: 1,
          socketId,
        });

      const uploadedFile = await uploadToFolder(folderId, file);
      if (!uploadedFile)
        throw new Error("Failed to upload assignment to Drive");

      if (socketId)
        await emitWorkerEvent("uploadProgress", {
          jobType: "uploadAssignment",
          status: "progress",
          current: 1,
          total: 1,
          socketId,
        });

      const submissionId = await generatedId("ASUB");
      await models.AssignmentSubmission.create({
        id: submissionId,
        assignmentId,
        studentId,
        fileId: uploadedFile.id,
        fileName: uploadedFile.name,
      });

      if (socketId)
        await emitWorkerEvent("uploadComplete", {
          jobType: "uploadAssignment",
          successful: 1,
          failed: 0,
          socketId,
        });

      return { success: true, submissionId, type: "submission" };
    } catch (error) {
      console.error("Error in uploadAssignment job:", error);
      if (socketId)
        await emitWorkerEvent("jobFailed", { error: error.message, socketId });
      throw error;
    }
  } else if (isNewAssignment) {
    try {
      if (socketId && file)
        await emitWorkerEvent("uploadProgress", {
          jobType: "uploadAssignment",
          status: "start",
          total: 1,
          socketId,
        });

      const id = await generatedId("ASS");

      const createFolder = require("../../googleServices/createDriveFolder");
      const course = await models.Course.findByPk(courseId);
      if (!course) throw new Error("Course not found");

      const folder = await createFolder(`${course.name} ${title} Submission`);
      createdFolderId = folder?.id; // Store for potential cleanup

      let fileId = null;
      let fileName = null;

      if (file) {
        const assignmentsFolder = await getCourseAssignmentsFolder(course.name);
        const uploadedFile = await uploadToFolder(assignmentsFolder.id, file);
        fileId = uploadedFile.id;
        fileName = uploadedFile.name;
        if (socketId)
          await emitWorkerEvent("uploadProgress", {
            jobType: "uploadAssignment",
            status: "progress",
            current: 1,
            total: 1,
            socketId,
          });
      }

      const newAssignment = await models.Assignment.create({
        id,
        title,
        description,
        courseId,
        deadline,
        submissionFolderID: folder?.id,
        fileId,
        fileName,
      });

      if (socketId)
        await emitWorkerEvent("uploadComplete", {
          jobType: "uploadAssignment",
          successful: 1,
          failed: 0,
          socketId,
        });

      return { success: true, assignmentId: id, type: "creation" };
    } catch (error) {
      console.error("Error in addAssignment job:", error);

      // FIX: Rollback - delete created folder if exists
      if (createdFolderId) {
        console.log(`Cleaning up orphan folder: ${createdFolderId}`);
        try {
          await deleteFile(createdFolderId);
          console.log("Orphan folder deleted successfully.");
        } catch (cleanupError) {
          console.error(
            "Failed to delete orphan folder during cleanup:",
            cleanupError
          );
        }
      }

      if (socketId)
        await emitWorkerEvent("jobFailed", {
          jobType: "uploadAssignment",
          error: error.message,
          socketId,
        });
      throw error;
    }
  }
}

module.exports = { uploadSlides, uploadAssignment };
