const models = require("../config/models");
const { generatedId } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const uploadToFolder = require("../googleServices/uploadToFolder");
const createFolder = require("../googleServices/createDriveFolder");
const getCourseAssignmentsFolder = require("../googleServices/getAssignmentsFolder");

exports.addAssignment = async (req, res) => {
  try {
    const { title, description, courseId, deadline } = req.body;
    if (!title || !description || !courseId || !deadline) {
      return handleError(
        res,
        400,
        "Title, description, course ID and deadline are required"
      );
    }
    const id = await generatedId("ASS");
    const course = await models.Course.findByPk(courseId);

    if (!course) {
      return handleError(
        res,
        404,
        "Course with provided courseId does not exist"
      );
    }

    const folderId = await createFolder(`${course?.name} ${title} Submission`);

    console.log(folderId);

    let fileId = null;
    let fileName = null;

    // Check if a file is uploaded
    if (req.file) {
      // Get or create the course-specific assignments folder
      const assignmentsFolder = await getCourseAssignmentsFolder(course.name);
      // Upload the file to the course-specific assignments folder
      const uploadedFile = await uploadToFolder(assignmentsFolder.id, req.file);
      fileId = uploadedFile.id;
      fileName = uploadedFile.name;
    }

    const newAssignment = await models.Assignment.create({
      id,
      title,
      description,
      courseId,
      deadline,
      submissionFolderID: folderId?.id,
      fileId,
      fileName,
    });
    return handleResponse(
      res,
      201,
      "Successfully added assignment",
      newAssignment
    );
  } catch (error) {
    return handleError(res, 500, "Error adding assignment", error);
  }
};

exports.allAssignment = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!courseId) {
      return handleError(res, 400, "Course ID is required");
    }
    const assignments = await models.Assignment.findAll({
      where: { courseId },
      order: ["createdAt", "DESC"]
    });
    if (!assignments) {
      return handleError(res, 404, "No assignments found for this course");
    }
    return handleResponse(
      res,
      200,
      "Assignments retrieved successfully",
      assignments
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving assignments", error);
  }
};

exports.assignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await models.Assignment.findByPk(id, {
      include: [{ model: models.Course, attributes: ["name"], as: "Course" }],
    });
    if (!assignment) {
      return handleError(res, 404, "Assignment not found");
    }
    return handleResponse(
      res,
      200,
      "Assignment retrieved successfully",
      assignment
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving assignment", error);
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline } = req.body;
    if (!title || !description || !deadline) {
      return handleError(
        res,
        400,
        "Title, description, and deadline are required"
      );
    }
    const [updated] = await models.Assignment.update(
      { title, description, deadline: deadline },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, "Assignment not found for update");
    }
    const updatedAssignment = await models.Assignment.findByPk(id);
    return handleResponse(
      res,
      200,
      "Assignment updated successfully",
      updatedAssignment
    );
  } catch (error) {
    return handleError(res, 500, "Error updating assignment", error);
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Assignment.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Assignment not found for deletion");
    }
    return handleResponse(res, 200, "Assignment deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting assignment", error);
  }
};

exports.uploadAssignment = async (req, res) => {
  try {
    if (!req.file) return handleError(res, 400, "No file uploaded");
    const { folderId } = req.body;

    const uploadedFile = await uploadToFolder(folderId, req.file);

    if (!uploadedFile) {
      return handleError(res, 400, "Failed to upload assignment");
    }

    return handleResponse(
      res,
      200,
      "Assignment uploaded successfully",
      uploadedFile
    );
  } catch (error) {
    handleError(res, 500, "Error uploading assignment", error);
  }
};
