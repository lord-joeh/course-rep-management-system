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

    const folder = await createFolder(`${course?.name} ${title} Submission`);

    console.log(folder);

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
      submissionFolderID: folder?.id,
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
    const { limit, page, courseId } = req.query;
    const _limit = parseInt(limit) || 10;
    const _page = parseInt(page) || 1;
    const offset = (_page - 1) * _limit;

    if (!courseId) {
      return handleError(res, 400, "Course ID is required");
    }
    const results = await models.Assignment.findAndCountAll({
      where: { courseId },
      limit: _limit,
      offset: offset,
      order: [["deadline", "DESC"]],
    });

    const { rows: assignments, count: totalItems } = results;
    const totalPages = Math.ceil(totalItems / _limit);

    if (!assignments) {
      return handleError(res, 404, "No assignments found for this course");
    }

    return handleResponse(res, 200, "Assignments retrieved successfully", {
      assignments: assignments,
      pagination: {
        totalItems,
        currentPage: _page,
        totalPages,
        itemsPerPage: _limit,
      },
    });
  } catch (error) {
    return handleError(res, 500, "Error retrieving assignments", error);
  }
};

exports.assignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await models.Assignment.findByPk(id, {
      include: [
        { model: models.Course, attributes: ["name"], as: "Course" },
        {
          model: models.AssignmentSubmission,
          as: "submissions",
          include: [
            { model: models.Student, attributes: ["id", "name", "email"] },
          ],
        },
      ],
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
    const { folderId, assignmentId, studentId } = req.body;

    if (!assignmentId || !studentId) {
      return handleError(res, 400, "Assignment ID and Student ID are required");
    }

    const uploadedFile = await uploadToFolder(folderId, req.file);

    if (!uploadedFile) {
      return handleError(res, 400, "Failed to upload assignment");
    }

    // Create submission record
    const submissionId = await generatedId("ASUB");
    await models.AssignmentSubmission.create({
      id: submissionId,
      assignmentId,
      studentId,
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
    });

    return handleResponse(
      res,
      200,
      "Your Assignment has been submitted successfully",
      uploadedFile
    );
  } catch (error) {
    handleError(res, 500, "Error uploading assignment", error);
  }
};

exports.getStudentSubmittedAssignments = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { limit, page } = req.query;
    const _limit = parseInt(limit) || 10;
    const _page = parseInt(page) || 1;
    const offset = (_page - 1) * _limit;

    if (!studentId) {
      return handleError(res, 400, "Student ID is required");
    }

    const results = await models.AssignmentSubmission.findAndCountAll({
      where: { studentId },
      include: [
        {
          model: models.Assignment,
          attributes: ["id", "title", "description", "deadline", "courseId"],
          include: [{ model: models.Course, attributes: ["name"] }],
        },
      ],
      limit: _limit,
      offset: offset,
      order: [["submittedAt", "DESC"]],
    });

    const { rows: submissions, count: totalItems } = results;
    const totalPages = Math.ceil(totalItems / _limit);

    if (!submissions) {
      return handleError(res, 404, "No submissions were found");
    }

    return handleResponse(res, 200, "Assignments retrieved successfully", {
      submissions,
      pagination: {
        totalItems,
        currentPage: _page,
        totalPages,
        itemsPerPage: _limit,
      },
    });
  } catch (error) {
    return handleError(res, 500, "Error retrieving student assignments", error);
  }
};
