const { generatedId, shuffle } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { connect } = require('../config/db');
const { sendGroupAssignmentEmail } = require('../services/customEmails');

exports.addGroup = async (req, res) => {
  let client;
  try {
    client = await connect();
    client.query('BEGIN');
    const { name, isGeneral, description } = req.body;
    let courseId = req.body.courseId;
    isGeneral ? (courseId = null) : courseId;
    if (!name || !description) {
      return handleError(res, 409, 'Name and description are required');
    }

    const id = await generatedId('GRP');

    const newGroup = await client.query(
      `INSERT INTO groups (id, name, courseId, isGeneral, description)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
      [id, name, courseId, isGeneral, description],
    );
    client.query('COMMIT');
    return handleResponse(
      res,
      201,
      'Group created successfully',
      newGroup.rows[0],
    );
  } catch (error) {
    client.query('ROLLBACK');
    return handleError(res, 500, 'Error adding group', error);
  } finally {
    client.release();
  }
};

exports.getAllGroups = async (req, res) => {
  let client;
  try {
    client = await connect();
    const groups = await client.query(`SELECT * FROM groups`);

    if (!groups.rows) {
      return handleError(res, 404, 'No groups was found');
    }

    return handleResponse(
      res,
      200,
      'Groups retrieved successfully',
      groups.rows,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving groups', error);
  } finally {
    client.release();
  }
};

exports.getGroupById = async (req, res) => {
  let client;
  try {
    client = await connect();
    const { id } = req.params;
    const group = await client.query(
      `
          SELECT 
          groups.*,
          course.id AS course_id,
          course.name AS course_name,
          ARRAY_AGG(
            JSONB_BUILD_OBJECT(
              'student_id', student.id,
              'student_name', student.name,
              'student_email', student.email,
              'is_leader', group_member.isleader
            )
          ) AS members
        FROM groups
        LEFT JOIN course ON groups.courseid = course.id
        LEFT JOIN group_member ON groups.id = group_member.groupid
        LEFT JOIN student ON group_member.studentid = student.id
        WHERE groups.id = $1
        GROUP BY groups.id, course.id, course.name;`,
      [id],
    );

    if (!group.rows.length) {
      return handleError(res, 404, 'No group found');
    }

    return handleResponse(
      res,
      200,
      'Group retrieved successfully',
      group.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving group', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.updateGroup = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { name, courseId, description } = req.body;
    client = await connect();
    const updatedGroup = await client.query(
      `UPDATE groups SET
                name = $1,
                courseId = $2,
                description = $3
                WHERE id = $4
                RETURNING *;
                `,
      [name, courseId, description, id],
    );
    if (!updatedGroup.rows) {
      return handleError(res, 404, 'Group not found for update');
    }
    return handleResponse(
      res,
      200,
      'Group updated successfully',
      updatedGroup.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating group', error);
  } finally {
    client.release();
  }
};

exports.deleteGroup = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    await client.query(`DELETE FROM groups WHERE id = $1`, [id]);

    return handleResponse(res, 200, 'Group deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting group', error);
  } finally {
    client.release();
  }
};

exports.createCustomGroup = async (req, res) => {
  let client;
  try {
    client = await connect();

    const { studentsPerGroup, isGeneral } = req.body;
    let courseId = req.body.courseId;
    isGeneral ? (courseId = null) : courseId;

    if (typeof studentsPerGroup !== 'number' || studentsPerGroup < 1) {
      return handleError(
        res,
        409,
        'Invalid input. Provide a positive number for group size.',
      );
    }

    const studentIds = await client.query(`SELECT id FROM student`);
    const studentIDs = await shuffle(studentIds.rows);

    if (!studentIDs.length) {
      return handleError(res, 404, 'No students found in Database');
    }

    let currentGroupNumber = 1;
    let totalGroups = 0;

    for (let i = 0; i < studentIDs.length; i += studentsPerGroup) {
      const groupName = `GROUP ${currentGroupNumber}`;
      const groupId = await generatedId('GRP');

      await client.query(
        `INSERT INTO groups (id, name, courseId, description)
        VALUES($1, $2, $3, $4)`,
        [groupId, groupName, courseId, groupName],
      );

      const group = studentIDs.slice(i, i + studentsPerGroup);

      // Await all member insertions
      await Promise.all(
        group.map(async (student, idx) => {
          let isLeader = true;
          idx !== 0 ? (isLeader = false) : isLeader;

          await client.query(
            `INSERT INTO group_member (groupId, studentId, isLeader)
            VALUES ($1, $2, $3)`,
            [groupId, student.id, isLeader],
          );

          const studentNameResult = await client.query(
            `SELECT name FROM student WHERE id = $1`,
            [student.id],
          );
        }),
      );

      //Send group assignment mail
      await sendGroupAssignmentEmail(groupId, groupName, group);

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
  } finally {
    if (client) client.release();
  }
};

exports.addGroupMember = async (req, res) => {
  let client;
  try {
    client = await connect();
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) {
      return handleError(res, 409, 'Student ID and Course ID are required');
    }

    //Check if student already exist in group
    const existingMember = await client.query(
      `SELECT * FROM group_member WHERE groupId = $1 AND studentId = $2`,
      [groupId, studentId],
    );

    if (existingMember.rows.length) {
      return handleError(res, 409, 'Student already exist in group');
    }

    const newMember = await client.query(
      `INSERT INTO group_member (groupId, studentId)
      VALUES ($1, $2)
      RETURNING *`,
      [groupId, studentId],
    );

    return handleResponse(
      res,
      201,
      'Student added to group successfully',
      newMember.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error adding group member', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteGroupMember = async (req, res) => {
  let client;
  try {
    const { id } = req.body;
    client = await connect();

    await client.query(`DELETE FROM group_member WHERE studentId = $1`, [id]);

    return handleResponse(res, 200, 'Successfully deleted group member');
  } catch (error) {
    return handleError(res, 500, 'Error deleting group member', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};
