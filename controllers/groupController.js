const { generatedId, shuffle } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { models } = require('../config/db');
const { sendGroupAssignmentEmail } = require('../services/customEmails');

exports.addGroup = async (req, res) => {
  try {
    const { name, isGeneral, description, courseId } = req.body;
    if (!name || !description) {
      return handleError(res, 409, 'Name and description are required');
    }
    const id = await generatedId('GRP');
    const newGroup = await models.Group.create({
      id,
      name,
      courseId: isGeneral ? null : courseId,
      isGeneral,
      description,
    });
    return handleResponse(res, 201, 'Group created successfully', newGroup);
  } catch (error) {
    return handleError(res, 500, 'Error adding group', error);
  }
};

exports.getAllGroups = async (req, res) => {
  try {
    const groups = await models.Group.findAll();
    if (!groups.length) {
      return handleError(res, 404, 'No groups was found');
    }
    return handleResponse(res, 200, 'Groups retrieved successfully', groups);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving groups', error);
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await models.Group.findOne({
      where: { id },
      include: [
        { model: models.Course, attributes: ['id', 'name'] },
        {
          model: models.Student,
          through: { attributes: ['isLeader'] },
          attributes: ['id', 'name', 'email'],
        },
      ],
    });
    if (!group) {
      return handleError(res, 404, 'No group found');
    }
    return handleResponse(res, 200, 'Group retrieved successfully', group);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving group', error);
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
      return handleError(res, 404, 'Group not found for update');
    }
    const updatedGroup = await models.Group.findOne({ where: { id } });
    return handleResponse(res, 200, 'Group updated successfully', updatedGroup);
  } catch (error) {
    return handleError(res, 500, 'Error updating group', error);
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Group.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, 'Group not found for deletion');
    }
    await models.GroupMember.destroy({ where: { groupId: id } });
    return handleResponse(res, 200, 'Group deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting group', error);
  }
};

exports.createCustomGroup = async (req, res) => {
  try {
    const { studentsPerGroup, isGeneral, courseId } = req.body;
    if (typeof studentsPerGroup !== 'number' || studentsPerGroup < 1) {
      return handleError(res, 409, 'Invalid input. Provide a positive number for group size.');
    }
    const studentIds = await models.Student.findAll({ attributes: ['id'] });
    const studentIDs = await shuffle(studentIds.map(s => s.toJSON()));
    if (!studentIDs.length) {
      return handleError(res, 404, 'No students found in Database');
    }
    let currentGroupNumber = 1;
    let totalGroups = 0;
    for (let i = 0; i < studentIDs.length; i += studentsPerGroup) {
      const groupName = `GROUP ${currentGroupNumber}`;
      const groupId = await generatedId('GRP');
      await models.Group.create({
        id: groupId,
        name: groupName,
        courseId: isGeneral ? null : courseId,
        description: groupName,
      });
      const group = studentIDs.slice(i, i + studentsPerGroup);
      await Promise.all(
        group.map(async (student, idx) => {
          let isLeader = idx === 0;
          await models.GroupMember.create({
            groupId,
            studentId: student.id,
            isLeader,
          });
        })
      );
      await sendGroupAssignmentEmail(groupName, group);
      currentGroupNumber += 1;
      totalGroups += 1;
    }
    return handleResponse(
      res,
      201,
      `Successfully created ${totalGroups} groups with ${studentIDs.length} students`,
    );
  } catch (error) {
    return handleError(res, 500, 'Error creating groups', error);
  }
};

exports.addGroupMember = async (req, res) => {
  try {
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) {
      return handleError(res, 409, 'Student ID and Course ID are required');
    }
    const existingMember = await models.GroupMember.findOne({ where: { groupId, studentId } });
    if (existingMember) {
      return handleError(res, 409, 'Student already exist in group');
    }
    const newMember = await models.GroupMember.create({ groupId, studentId });
    return handleResponse(res, 201, 'Student added to group successfully', newMember);
  } catch (error) {
    return handleError(res, 500, 'Error adding group member', error);
  }
};

exports.deleteGroupMember = async (req, res) => {
  try {
    const { id } = req.body;
    const deleted = await models.GroupMember.destroy({ where: { studentId: id } });
    if (!deleted) {
      return handleError(res, 404, 'Group member not found for deletion');
    }
    return handleResponse(res, 200, 'Successfully deleted group member');
  } catch (error) {
    return handleError(res, 500, 'Error deleting group member', error);
  }
};
