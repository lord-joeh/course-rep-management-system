const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const uploadToFolder = require("../../googleServices/uploadToFolder");
const models = require("../../config/models");
const { generatedId } = require("../../services/customServices");
const { enqueue } = require("../../services/enqueue");
const getCourseAssignmentsFolder = require("../../googleServices/getAssignmentsFolder");require("../../googleServices/deleteFile");

async function uploadSlides(job) {
  const { files, folderId, courseId, socketId } = job.data;

  const successfulUploads = [];
  const failedUploads = [];

  // Notify start
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

      await emitWorkerEvent("uploadProgress", {
        jobType: "uploadSlides",
        status: "progress",
        current: i + 1,
        total: files.length,
        slide,
        socketId,
      });
    } catch (err) {
      console.error(`Failed to upload slide ${file.originalname}:`, err);
      failedUploads.push({ file: file.originalname, error: err.message });
    }
  }

  // Notify completion
  await emitWorkerEvent("uploadComplete", {
    jobType: "uploadSlides",
    successful: successfulUploads.length,
    failed: failedUploads.length,
    failedItems: failedUploads,
    socketId,
  });

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


  await emitWorkerEvent("jobStarted", {
    jobType: "uploadAssignment",
    message: "Uploading Assignment...",
    socketId,
  });

  if (studentId && assignmentId && !isNewAssignment) {
    try {
      await emitWorkerEvent("jobProgress", {
        jobType: "uploadAssignment",
        progress: 25,
        message: "Uploading assignment to Drive...",
        socketId,
      });

      const uploadedFile = await uploadToFolder(folderId, file);
      if (!uploadedFile)
        throw new Error("Failed to upload assignment to Drive");

      await emitWorkerEvent("jobProgress", {
        jobType: "uploadAssignment",
        progress: 50,
        message: "Checking for duplicates...",
        socketId,
      });

      const submissionId = await generatedId("ASUB");

      await emitWorkerEvent("jobProgress", {
        jobType: "uploadAssignment",
        progress: 75,
        message: "Uploading...",
        socketId,
      });

      await models.AssignmentSubmission.create({
        id: submissionId,
        assignmentId,
        studentId,
        fileId: uploadedFile.id,
        fileName: uploadedFile.name,
      });

      await emitWorkerEvent("jobComplete", {
        jobType: "uploadAssignment",
        message: "Assignment uploaded successfully.",
        socketId,
      });

      return { success: true, submissionId, type: "submission" };
    } catch (error) {
      console.error("Error in uploadAssignment job:", error);

      await emitWorkerEvent("jobFailed", { error: error.message, socketId });
      throw error;
    }
  } else if (isNewAssignment) {
    try {

      if (file)
        await emitWorkerEvent("jobProgress", {
          jobType: "uploadAssignment",
          progress: 25,
          message: "Uploading assignment to Drive...",
          socketId,
        });

      const id = await generatedId("ASS");

      const createFolder = require("../../googleServices/createDriveFolder");
      const course = await models.Course.findByPk(courseId);
      if (!course) throw new Error("Course not found");

      await emitWorkerEvent("jobProgress", {
        jobType: "uploadAssignment",
        progress: 50,
        message: "Creating necessary folder...",
        socketId,
      });
      const folder = await createFolder(`${course.name} ${title} Submission`);

      let fileId = null;
      let fileName = null;

      await emitWorkerEvent("jobProgress", {
        jobType: "uploadAssignment",
        progress: 75,
        message: "Uploading assignment to folder...",
        socketId,
      });
      if (file) {
        const assignmentsFolder = await getCourseAssignmentsFolder(course.name);
        const uploadedFile = await uploadToFolder(assignmentsFolder.id, file);
        fileId = uploadedFile.id;
        fileName = uploadedFile.name;

        await emitWorkerEvent("jobProgress", {
          jobType: "uploadAssignment",
          progress: 90,
          message: "Writing Assignment Data...",
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

      await emitWorkerEvent("jobComplete", {
        jobType: "uploadAssignment",
        message: "Assignment uploaded successfully.",
        socketId,
      });

      return { success: true, assignmentId: id, type: "creation" };
    } catch (error) {
      console.error("Error in addAssignment job:", error);

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
