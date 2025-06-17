const generatedId = require('../services/generateIdService');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { connect } = require('../config/db');
const { cli } = require('winston/lib/winston/config');

exports.addGroup = async (req, res) => {
  let client;
  try {
    client = await connect();
    client.query('BEGIN');
    const { name, isGeneral, description } = req.body;
    let courseId = req.body.courseId;
    isGeneral ? (courseId = null) : courseId;
    if (!name || !description) {
      handleError(res, 409, 'Name and description are required');
    }

    const id = await generatedId('GRP');

    const newGroup = await client.query(
      `INSERT INTO groups (id, name, courseId, isGeneral, description)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
      [id, name, courseId, isGeneral, description],
    );
    client.query('COMMIT');
    handleResponse(res, 201, 'Group created successfully', newGroup.rows[0]);
  } catch (error) {
    client.query('ROLLBACK');
    handleError(res, 500, 'Error adding group', error);
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
      handleError(res, 404, 'No groups was found');
    }

    handleResponse(res, 200, 'Groups retrieved successfully', groups.rows);
  } catch (error) {
    handleError(res, 500, 'Error retrieving groups', error);
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
            course.lecturerid, 
            group_member.isleader
            FROM groups
            LEFT JOIN course ON groups.courseid = course.id
            LEFT JOIN group_member ON groups.id = group_member.groupid
            LEFT JOIN student ON group_member.studentid = student.id
            WHERE groups.id = $1;`,
      [id],
    );

    if (!group.rows.length) {
      handleError(res, 404, 'No group found');
    }

    handleResponse(res, 200, 'Group retrieved successfully', group.rows[0]);
  } catch (error) {
    handleError(res, 500, 'Error retrieving group', error);
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
      handleError(res, 404, 'Group not found for update');
    }
    handleResponse(
      res,
      200,
      'Group updated successfully',
      updatedGroup.rows[0],
    );
  } catch (error) {
    handleError(res, 500, 'Error updating group', error);
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

    handleResponse(res, 200, 'Group deleted successfully');
  } catch (error) {
    handleError(res, 500, 'Error deleting group');
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
      handleError(
        res,
        409,
        'Invalid input. Provide a positive number for group size.',
      );
    }

    const studentIds = await client.query(`SELECT id FROM student`);
    const studentIDs = studentIds.rows;

    if (!studentIDs.length) {
      handleError(res, 404, 'No students found in Database');
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

      console.log(201, `${groupName} successfully created`);
      const group = studentIDs.slice(i, i + studentsPerGroup);

      // Await all member insertions
      await Promise.all(
        group.map(async (student) => {
          await client.query(
            `INSERT INTO group_member (groupId, studentId)
            VALUES ($1, $2)`,
            [groupId, student.id],
          );

          const studentNameResult = await client.query(
            `SELECT name FROM student WHERE id = $1`,
            [student.id],
          );

          const studentName = studentNameResult.rows[0]?.name || 'Unknown';
          console.log(201, `Successfully added ${studentName} to ${groupName}`);
        }),
      );

      currentGroupNumber += 1;
      totalGroups += 1;
    }
    handleResponse(
      res,
      201,
      `Successfully created ${totalGroups} groups with ${studentIDs.length} students`,
    );
  } catch (error) {
    handleError(res, 500, 'Error creating groups', error);
  } finally {
    if (client) client.release();
  }
};
