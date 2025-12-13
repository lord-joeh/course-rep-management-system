const { getEmitter } = require("../../middleware/socketIO");
const uploadToFolder = require("../../googleServices/uploadToFolder");
const models = require("../../config/models");
const { generatedId } = require("../../services/customServices");
const { enqueue } = require("../../services/enqueue");
const getCourseAssignmentsFolder = require("../../googleServices/getAssignmentsFolder");

async function uploadSlides(job) {
  const { files, folderId, courseId, socketId } = job.data;
  const emitter = getEmitter();

  const successfulUploads = [];
  const failedUploads = [];

  // Notify start
  if (socketId)
    emitter.emit("uploadProgress", {
      status: "start",
      total: files.length,
      socketId,
    });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      // file object here is likely a plain object from job data, so it has .path
      // uploadToFolder requires { path: '...', originalname: '...' } etc

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
          slideId: slide.id,
          driveFileID: uploadRes.id,
          courseId,
          socketId,
        },
        { removeOnComplete: { age: 3600 } }
      );

      if (socketId) {
        emitter.emit("uploadProgress", {
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
    emitter.emit("uploadComplete", {
      successful: successfulUploads.length,
      failed: failedUploads.length,
      failedItems: failedUploads,
      socketId,
    });
  }

  return { successful: successfulUploads.length, failed: failedUploads.length };
}

async function uploadAssignment(job) {
  // This handles the 'uploadAssignment' (submission) route and possibly 'addAssignment' if tailored
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
    socketId, // Ensure we extract socketId
  } = job.data;

  const emitter = getEmitter();

  // CASE 1: Student Submission (uploadAssignment)
  if (studentId && assignmentId && !isNewAssignment) {
    try {
      if (socketId)
        emitter.emit("uploadProgress", { status: "start", total: 1, socketId });

      const uploadedFile = await uploadToFolder(folderId, file);
      if (!uploadedFile)
        throw new Error("Failed to upload assignment to Drive");

      if (socketId)
        emitter.emit("uploadProgress", {
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
        emitter.emit("uploadComplete", { successful: 1, failed: 0, socketId });

      return { success: true, submissionId, type: "submission" };
    } catch (error) {
      console.error("Error in uploadAssignment job:", error);
      if (socketId)
        emitter.emit("jobFailed", { error: error.message, socketId });
      throw error;
    }
  }
  // CASE 2: Rep adding assignment with file (addAssignment)
  else if (isNewAssignment) {
    try {
      if (socketId && file)
        emitter.emit("uploadProgress", { status: "start", total: 1, socketId });

      const id = await generatedId("ASS");

      const createFolder = require("../../googleServices/createDriveFolder");
      const course = await models.Course.findByPk(courseId);
      if (!course) throw new Error("Course not found");

      const folder = await createFolder(`${course.name} ${title} Submission`);

      let fileId = null;
      let fileName = null;

      if (file) {
        const assignmentsFolder = await getCourseAssignmentsFolder(course.name);
        const uploadedFile = await uploadToFolder(assignmentsFolder.id, file);
        fileId = uploadedFile.id;
        fileName = uploadedFile.name;
        if (socketId)
          emitter.emit("uploadProgress", {
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
        emitter.emit("uploadComplete", { successful: 1, failed: 0, socketId });

      return { success: true, assignmentId: id, type: "creation" };
    } catch (error) {
      console.error("Error in addAssignment job:", error);
      if (socketId)
        emitter.emit("jobFailed", { error: error.message, socketId });
      throw error;
    }
  }
}

module.exports = { uploadSlides, uploadAssignment };
