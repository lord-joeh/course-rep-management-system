const { generatedId, shuffle } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const models = require("../config/models");
const { sendGroupAssignmentEmail } = require("../services/customEmails");
const { enqueue } = require("../services/enqueue");

exports.addGroup = async (req, res) => {
  try {
    const { name, isGeneral, description, courseId } = req.body;
    if (!name || !description) {
      return handleError(res, 400, "Name and description are required");
    }
    if (!isGeneral) {
      if (!courseId) {
        return handleError(
          res,
          400,
          "courseId is required for non-general groups"
        );
      }
      const courseExists = await models.Course.findOne({
        where: { id: courseId },
      });
      if (!courseExists) {
        return handleError(
          res,
          404,
          "Course with provided courseId does not exist"
        );
      }
    }
    const id = await generatedId("GRP");
    const newGroup = await models.Group.create({
      id,
      name,
      courseId: isGeneral ? null : courseId,
      isGeneral,
      description,
    });
    return handleResponse(res, 201, "Group created successfully", newGroup);
  } catch (error) {
    return handleError(res, 500, "Error adding group", error);
  }
};

exports.getAllGroups = async (req, res) => {
  const { courseId, page, limit } = req.query;
  const _page = parseInt(page, 10) || 1;
  const _limit = parseInt(limit, 10) || 10;
  const offset = (_page - 1) * _limit;
  try {
    const where = courseId ? { courseId } : {};
    const result = await models.Group.findAndCountAll({
      where,
      limit: _limit,
      offset: offset,
      include: [{ model: models.Course, attributes: ["name"] }],
    });

    const { rows: groups, count: totalItems } = result;

    const totalPages = Math.ceil(totalItems / _limit);

    if (!groups) {
      return handleError(res, 404, "No groups were found");
    }
    return handleResponse(res, 200, "Groups retrieved successfully", {
      groups: groups,
      pagination: {
        totalItems,
        currentPage: _page,
        totalPages,
        itemsPerPage: _limit,
      },
    });
  } catch (error) {
    return handleError(res, 500, "Error retrieving groups", error);
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await models.Group.findOne({
      where: { id },
      include: [
        { model: models.Course, attributes: ["id", "name"] },
        {
          model: models.Student,
          through: { attributes: ["isLeader"] },
          attributes: ["id", "name", "email"],
        },
      ],
    });
    if (!group) {
      return handleError(res, 404, "No group found");
    }
    return handleResponse(res, 200, "Group retrieved successfully", group);
  } catch (error) {
    return handleError(res, 500, "Error retrieving group", error);
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, courseId, description } = req.body;
    const [updated] = await models.Group.update(
      { name, courseId, description },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, "Group not found for update");
    }
    const updatedGroup = await models.Group.findOne({ where: { id } });
    return handleResponse(res, 200, "Group updated successfully", updatedGroup);
  } catch (error) {
    return handleError(res, 500, "Error updating group", error);
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await models.Group.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Group not found for deletion");
    }
    await models.GroupMember.destroy({ where: { groupId: id } });
    return handleResponse(res, 200, "Group deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting group", error);
  }
};

exports.createCustomGroup = async (req, res) => {
  try {
    const { studentsPerGroup, isGeneral, courseId } = req.body;
    if (!Number.isInteger(studentsPerGroup) || studentsPerGroup < 1) {
      return handleError(
        res,
        400,
        "Invalid input. Provide a positive integer for group size."
      );
    }

    // If this is not a general group, require a courseId
    if (!isGeneral && !courseId) {
      return handleError(
        res,
        400,
        "courseId is required for non-general groups"
      );
    }

    await enqueue("processCustomGroups", {
      studentsPerGroup,
      isGeneral,
      courseId,
      socketId: req?.socketId,
      userId: req?.user?.id,
    });

    return handleResponse(res, 201, `Group creation job enqueued successfully`);
  } catch (error) {
    return handleError(res, 500, "Error creating groups", error);
  }
};

exports.addGroupMember = async (req, res) => {
  try {
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) {
      return handleError(res, 409, "Student ID and Course ID are required");
    }

    // Ensure group exists
    const group = await models.Group.findByPk(groupId);
    if (!group) {
      return handleError(res, 404, "Group not found");
    }

    // Ensure student exists
    const student = await models.Student.findByPk(studentId);
    if (!student) {
      return handleError(res, 404, "Student not found");
    }

    // If the group is tied to a course, ensure the student is enrolled in that course
    if (group.courseId) {
      const enrolled = await models.CourseStudent.findOne({
        where: { courseId: group.courseId, studentId },
      });
      if (!enrolled) {
        return handleError(
          res,
          409,
          "Student is not enrolled in the course for this group"
        );
      }
    }

    const existingMember = await models.GroupMember.findOne({
      where: { groupId, studentId },
    });
    if (existingMember) {
      return handleError(res, 409, "Student already exist in group");
    }
    const newMember = await models.GroupMember.create({ groupId, studentId });
    return handleResponse(
      res,
      201,
      "Student added to group successfully",
      newMember
    );
  } catch (error) {
    return handleError(res, 500, "Error adding group member", error);
  }
};

exports.deleteGroupMember = async (req, res) => {
  try {
    const { studentId } = req.params;
    const deleted = await models.GroupMember.destroy({
      where: { studentId: studentId },
    });
    if (!deleted) {
      return handleError(res, 404, "Group member not found for deletion");
    }
    return handleResponse(res, 200, "Successfully deleted group member");
  } catch (error) {
    return handleError(res, 500, "Error deleting group member", error);
  }
};
