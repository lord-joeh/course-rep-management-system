const { connect } = require('../config/db');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { sendNotification } = require('../utils/sendEmail');
const { sendResetLink } = require('../services/customEmails');
require('dotenv').config();

exports.login = async (req, res) => {
  let client;
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return handleError(res, 409, 'Student ID and Password are required');
    }

    client = await connect();

    const student = await client.query(`SELECT * FROM student WHERE id = $1`, [
      studentId,
    ]);

    if (!student.rows.length) {
      return handleError(res, 404, 'Student does not exist');
    }

    const validStudent = student.rows[0];

    const isMatch = await bcrypt.compare(password, validStudent.password_hash);

    if (!isMatch) {
      return handleError(res, 400, 'Invalid credentials');
    }
    validStudent.password_hash = undefined;

    const token = jwt.sign(
      {
        id: validStudent.id,
        email: validStudent.email,
        isRep: validStudent.isRep,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      data: validStudent,
    });
  } catch (error) {
    return handleError(res, 500, 'Error logging in', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.forgotPassword = async (req, res) => {
  let client;
  try {
    const { studentId, email } = req.body;
    if (!studentId || !email) {
      return handleError(res, 409, 'Student ID and email required');
    }
    client = await connect();

    const forgotStudent = await client.query(
      `SELECT
            s.id AS student_id,
            s.email AS student_email,
            v.reset_token,
            v.reset_token_expiration
            FROM student s
            LEFT JOIN verification v ON v.student_id = s.id
            WHERE s.id = $1 AND s.email = $2`,
      [studentId, email],
    );

    if (!forgotStudent.rows.length) {
      return handleError(res, 404, 'Student not found');
    }
    const student = forgotStudent.rows[0];

    const resetToken = jwt.sign(
      { id: student.student_id, email: student.student_email },
      process.env.JWT_RESET,
      { expiresIn: '5m' },
    );
    const resetTokenExpiration = new Date(Date.now() + 5 * 60 * 1000);

    const resetData = await client.query(
      `INSERT INTO verification (student_id, reset_token, reset_token_expiration)
     VALUES ($1, $2, $3)
     ON CONFLICT (student_id)
     DO UPDATE SET reset_token = $2, reset_token_expiration = $3
     RETURNING *`,
      [student.student_id, resetToken, resetTokenExpiration],
    );

    await sendResetLink(student.student_email, resetToken);
    return handleResponse(
      res,
      200,
      'Reset link sent if email provided is correct',
    );
  } catch (error) {
    return handleError(res, 500, 'Error requesting reset password link', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.resetPassword = async (req, res) => {
  let client;
  try {
    const { newPassword } = req.body;
    const { token } = req.query;

    if (!newPassword) {
      return handleError(res, 409, 'New password is required');
    }
    const decoded = jwt.verify(token, process.env.JWT_RESET);
    client = await connect();

    const now = new Date(Date.now());

    const student = await client.query(
      `SELECT
        s.id AS student_id,
        s.email AS student_email,
        v.reset_token,
        v.reset_token_expiration
     FROM student s
     INNER JOIN verification v ON v.student_id = s.id
     WHERE s.id = $1 AND v.reset_token = $2 AND v.reset_token_expiration > $3`,
      [decoded.id, token, now],
    );

    if (!student.rows.length) {
      return handleError(
        res,
        409,
        'Invalid or Expired token. Request link again',
      );
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE student SET
            password_hash = $1
            WHERE id = $2 AND email = $3`,
      [hashedPassword, decoded.id, decoded.email],
    );

    return handleResponse(res, 200, 'Password has successfully been reset');
  } catch (error) {
    return handleError(res, 500, 'Error resetting password', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.changePassword = async (req, res) => {
  let client;
  try {
    const { sid } = req.query;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return handleError(res, 409, 'Current and new password required');
    }
    client = await connect();
    const student = await client.query(
      `SELECT password_hash from student
        WHERE id = $1`,
      [sid],
    );

    if (!student.rows.length) {
      return handleError(
        res,
        404,
        'Can not change the password of this account',
      );
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      student.rows[0].password_hash,
    );
    if (!isMatch) {
      return handleError(res, 400, 'Invalid password for current password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE student 
        set password_hash = $1
        WHERE id = $2`,
      [hashedPassword, sid],
    );

    return handleResponse(res, 200, 'Password successfully changed');
  } catch (error) {
    return handleError(res, 500, 'Error changing password', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};
