const { connect } = require('../config/db');
const { generatedId, formatDate } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.addAssignment = async (req, res) => {
  let client;
  try {
    const { title, description, courseId, deadline } = req.body;

    if (!title || !description || !courseId || !deadline) {
      handleError(
        res,
        409,
        'Title, description, course ID and dead line are required',
      );
    }
    client = await connect();
    const id = await generatedId('ASS');
    const formattedDeadline = await formatDate(deadline);

    const newAssignment = await client.query(
      `INSERT INTO assignment (id, title, description, courseId, deadline)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
      [id, title, description, courseId, formattedDeadline],
    );

    handleResponse(
      res,
      201,
      'Successfully added assignment',
      newAssignment.rows[0],
    );
  } catch (error) {
    handleError(res, 500, 'Error adding assignment', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.allAssignment = async (req, res) => {
  let client;
  try {
    client = await connect();

    const assignments = await client.query(`SELECT * FROM assignment`);
    if (!assignments.rows.length) {
      handleError(res, 404, 'No assignments found');
    }

    handleResponse(
      res,
      200,
      'Assignments retrieved successfully',
      assignments.rows,
    );
  } catch (error) {
    handleError(res, 500, 'Error retrieving assignments', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.assignmentById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    const assignment = await client.query(
      `SELECT 
            assignment.*,
            course.name AS course_name
            FROM assignment
            LEFT JOIN course ON assignment.courseid = course.id
            WHERE assignment.id = $1;`,
      [id],
    );
    if (!assignment.rows.length) {
      handleError(res, 404, 'Assignment not found');
    }

    handleResponse(
      res,
      200,
      'Assignment retrieved successfully',
      assignment.rows[0],
    );
  } catch (error) {
    handleError(res, 500, 'Error retrieving assignment', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.updateAssignment = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { title, description, deadline } = req.body;

    if (!title || !description || !deadline) {
      handleError(res, 409, 'Title, description, and deadline are required');
    }
    client = await connect();
    const formattedDeadline = formatDate(deadline);

    const assignment = await client.query(
      `UPDATE assignment 
            SET title = $1,
                description = $2,
                deadline = $3
                WHERE id = $4
                RETURNING *;`,
      [title, description, formattedDeadline, id],
    );

    if (!assignment.rows.length) {
      handleError(res, 404, 'Assignment not found for update');
    }

    handleResponse(
      res,
      200,
      'Assignment updated successfully',
      assignment.rows[0],
    );
  } catch (error) {
    handleError(res, 500, 'Error updating assignment', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteAssignment = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    await client.query(`DELETE FROM assignment WHERE id = $1`, [id]);

    handleResponse(res, 200, 'Assignment deleted successfully');
  } catch (error) {
    handleError(res, 500, 'Error deleting assignment', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};
