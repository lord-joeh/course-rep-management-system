const models = require("../config/models");
const { generatedId } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const { enqueue } = require("../services/enqueue");

exports.addAssignment = async (req, res) => {
  try {
    const { title, description, courseId, deadline } = req.body;
    const socketId = req?.socketId;
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

    console.log("Enqueueing assignment creation...");

    await enqueue("uploadAssignment", {
      isNewAssignment: true,
      assignmentId: id,
      title,
      description,
      courseId,
      deadline,
      file: req.file,
      socketId,
    });

    console.log("Assignment creation enqueued successfully");

    return handleResponse(res, 202, "Assignment creation queued", {
      assignmentId: id,
    });
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
    const { limit, page } = req.query;
    const _limit = parseInt(limit) || 10;
    const _page = parseInt(page) || 1;
    const offset = (_page - 1) * _limit;

    const assignment = await models.Assignment.findByPk(id, {
      include: [{ model: models.Course, attributes: ["name"], as: "Course" }],
    });
    if (!assignment) {
      return handleError(res, 404, "Assignment not found");
    }

    const results = await models.AssignmentSubmission.findAndCountAll({
      where: { assignmentId: id },
      include: [{ model: models.Student, attributes: ["id", "name", "email"] }],
      limit: _limit,
      offset: offset,
      order: [["submittedAt", "DESC"]],
    });

    const { rows: submissions, count: totalItems } = results;
    const totalPages = Math.ceil(totalItems / _limit);

    return handleResponse(res, 200, "Assignment retrieved successfully", {
      assignment,
      submissions: {
        submissions,
        pagination: {
          totalItems,
          currentPage: _page,
          totalPages,
          itemsPerPage: _limit,
        },
      },
    });
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

    const submissions = await models.AssignmentSubmission.findAll({
      where: { assignmentId: id },
    });

    const fileIdsToDelete = submissions.map((s) => s.fileId).filter((id) => id);

    if (fileIdsToDelete.length > 0) {
      await enqueue("deleteFiles", { fileIds: fileIdsToDelete });
    }

    await models.AssignmentSubmission.destroy({ where: { assignmentId: id } });

    const deleted = await models.Assignment.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Assignment not found for deletion");
    }

    return handleResponse(
      res,
      200,
      "Assignment and all submissions deleted successfully"
    );
  } catch (error) {
    return handleError(res, 500, "Error deleting assignment", error);
  }
};

exports.uploadAssignment = async (req, res) => {
  console.log("Uploading assignment...");
  try {
    if (!req.file) return handleError(res, 400, "No file uploaded");
    const { folderId, assignmentId, studentId } = req.body;
    const socketId = req?.socketId;

    if (!assignmentId || !studentId) {
      return handleError(res, 400, "Assignment ID and Student ID are required");
    }

    const assignment = await models.Assignment.findByPk(assignmentId);

    if (!assignment) return handleError(res, 404, "Assignment not found");

    if (new Date() > assignment.deadline)
      return handleError(res, 400, "Assignment submission closed");

    // Enqueue submission upload
    await enqueue("uploadAssignment", {
      isNewAssignment: false,
      folderId,
      assignmentId,
      studentId,
      file: req.file,
      socketId,
    });

    return handleResponse(
      res,
      202,
      "Your Assignment submission has been queued",
      { file: req.file.originalname }
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

exports.deleteSubmittedAssignment = async (req, res) => {
  try {
    const { studentId, assignmentId, submittedAt } = req.query;
    const { submissionId } = req.params;

    if (!studentId || !submissionId || !assignmentId || !submittedAt) {
      return handleError(
        res,
        400,
        "Student ID, Submission ID, Assignment ID, and Submitted At are required"
      );
    }

    // Verify assignment exists
    const assignment = await models.Assignment.findByPk(assignmentId);
    if (!assignment) {
      return handleError(res, 404, "Assignment not found");
    }

    // Verify student exists
    const student = await models.Student.findByPk(studentId);
    if (!student) {
      return handleError(res, 404, "Student not found");
    }

    const submission = await models.AssignmentSubmission.findOne({
      where: {
        id: submissionId,
        assignmentId,
        studentId,
        submittedAt: new Date(submittedAt),
      },
    });
    if (!submission) {
      return handleError(
        res,
        404,
        "Submission not found or details do not match"
      );
    }


    if (submission.fileId) {
      await enqueue("deleteFiles", { fileIds: [submission.fileId] });
    }

    await models.AssignmentSubmission.destroy({ where: { id: submissionId } });

    return handleResponse(
      res,
      200,
      "Submitted assignment deleted successfully"
    );
  } catch (error) {
    return handleError(res, 500, "Error deleting submitted assignment", error);
  }
};
