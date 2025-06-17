const { connect } = require('../config/db');
const bcrypt = require('bcrypt');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.registerStudent = async (req, res) => {
  let client;
  try {
    const { id, name, email, phone, password } = req.body;
    client = await connect();
    client.query('BEGIN');

    if (!id || !name || !email || !phone || !password) {
      handleError(
        res,
        409,
        'Student Id, name, email, phone, and password are required',
      );
    }

    //Check for existing student with same id
    const existingStudent = await client.query(
      `SELECT * FROM student WHERE id = $1`,
      [id],
    );
    client.query('COMMIT');

    if (existingStudent.rows[0]) {
      handleError(res, 409, 'Student already exist');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newStudent = await client.query(
      `INSERT INTO student
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
      [id, name, email, phone, hashedPassword],
    );

    client.query('COMMIT');
    newStudent.rows[0].password_hash = undefined;
    handleResponse(
      res,
      201,
      'Student registered successfully',
      newStudent.rows[0],
    );
  } catch (error) {
    client.query('ROLLBACK');
    handleError(res, 500, 'Error registering student', error);
  } finally {
    client.release();
  }
};

exports.getAllStudent = async (req, res) => {
  let client;
  try {
    client = await connect();

    const students = await client.query(`SELECT * FROM student`);

    if (!students.rows) {
      handleError(res, 409, 'No student found');
    }

    await students.rows.forEach((s) => (s.password_hash = undefined));

    handleResponse(res, 200, 'Students retrieved successfully', students.rows);
  } catch (error) {
    handleError(res, 500, 'Error retrieving students');
  } finally {
    client.release();
  }
};

exports.getStudentById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();
    const student = await client.query(
      `
            SELECT 
            student.*,
            ARRAY_AGG(
              JSONB_BUILD_OBJECT(
                'group_id', groups.id,
                'group_name', groups.name,
                'is_leader', group_member.isleader
              )
            ) AS groups
          FROM student
          LEFT JOIN group_member ON student.id = group_member.studentid
          LEFT JOIN groups ON group_member.groupid = groups.id
          WHERE student.id = $1
          GROUP BY student.id;`,
      [id],
    );
    if (!student.rows) {
      handleError(res, 404, 'Student not found');
    }

    student.rows[0].password_hash = undefined;

    handleResponse(res, 200, 'Student retrieved successfully', student.rows[0]);
  } catch (error) {
    handleError(res, 500, 'Error retrieving student', error);
  } finally {
    client.release();
  }
};

exports.updateStudent = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;
    client = await connect();

    const updatedStudent = await client.query(
      `UPDATE student SET
            name = $1,
            email = $2,
            phone = $3
            WHERE id = $4
            RETURNING *;
            `,
      [name, email, phone, id],
    );

    if (!updatedStudent.rows) {
      handleError(res, 404, 'Student not found for update');
    }

    updatedStudent.rows[0].password_hash = undefined;
    handleResponse(
      res,
      200,
      'Student updated successfully',
      updatedStudent.rows[0],
    );
  } catch (error) {
    handleError(res, 500, 'Error updating student', error);
  } finally {
    client.release();
  }
};

exports.deleteStudent = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    await client.query(`DELETE FROM student WHERE id = $1`, [id]);

    handleResponse(res, 200, 'Student deleted successfully');
  } catch (error) {
    handleError(res, 500, 'Error deleting student', error);
  } finally {
    client.release();
  }
};
