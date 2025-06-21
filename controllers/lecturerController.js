require('dotenv').config();
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { connect } = require('../config/db');
const { generatedId } = require('../services/customServices');

exports.addLecturer = async (req, res) => {
  let client;
  try {
    client = await connect();
    await client.query('BEGIN');
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
      return handleError(res, 400, 'name, email, phone are required');
    }

    const id = await generatedId('LECT');

    // check for existing lecturer
    const existingLecturer = await client.query(
      'SELECT * FROM lecturer WHERE email = $1',
      [email],
    );
    if (existingLecturer.rows.length > 0) {
      return handleError(res, 409, 'Email is already registered');
    }

    const newLecturer = await client.query(
      `INSERT INTO lecturer (id, name, email, phone)
      VALUES($1, $2, $3, $4)
      RETURNING id, name, email, phone`,
      [id, name, email, phone],
    );

    await client.query('COMMIT');
    return handleResponse(
      res,
      201,
      'Lecturer added successfully',
      newLecturer.rows[0],
    );
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return handleError(res, 500, 'Error adding lecturer', error);
  } finally {
    if (client) client.release();
  }
};

exports.getAllLecturer = async (req, res) => {
  let client;
  try {
    client = await connect();

    const lecturers = await client.query('SELECT * FROM lecturer');

    if (!lecturers.rows) {
      return handleError(res, 404, 'No lecturer was found');
    }

    return handleResponse(
      res,
      200,
      'Lecturers retrieved successfully',
      lecturers.rows,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving lecturers', error);
  } finally {
    if (client) client.release();
  }
};

exports.getLecturerById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    const lecturer = await client.query(
      `SELECT 
        lecturer.*, 
        course.id AS course_id, 
        course.name AS course_name, 
        course.day, 
        course.start_time, 
        course.end_time, 
        course.semester
        FROM lecturer
        LEFT JOIN course ON course.lecturerid = lecturer.id
        WHERE lecturer.id = $1;`,
      [id],
    );

    if (lecturer.rows.length === 0) {
      return handleError(res, 404, 'Lecturer not found');
    }

    return handleResponse(
      res,
      200,
      'Lecturer retrieved successfully',
      lecturer.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving lecturer', error);
  } finally {
    if (client) client.release();
  }
};

exports.updateLecturer = async (req, res) => {
  let client;

  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;

    if (!name || !email || !phone) {
      return handleError(res, 409, 'name, email, and phone are required');
    }
    client = await connect();

    const updatedLecturer = await client.query(
      `
        UPDATE lecturer
        SET name = $1,
            email = $2,
            phone = $3
        WHERE id = $4
        RETURNING *;`,
      [name, email, phone, id],
    );

    if (updatedLecturer.rows.length === 0) {
      return handleError(res, 404, 'Lecturer not found');
    }

    return handleResponse(
      res,
      202,
      'Lecturer updated successfully',
      updatedLecturer.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating lecturer', error);
  } finally {
    client.release();
  }
};

exports.deleteLecturer = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    await client.query(`DELETE FROM lecturer WHERE id = $1`, [id]);

    return handleResponse(res, 200, 'Lecturer deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting lecturer', error);
  } finally {
    client.release();
  }
};
