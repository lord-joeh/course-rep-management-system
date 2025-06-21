const { connect } = require('../config/db');
const { generatedId, generateQR } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const jwt = require('jsonwebtoken');

exports.attendanceInstance = async (req, res) => {
  let client;
  try {
    const { courseId, date } = req.body;
    if (!courseId || !date) {
      handleError(res, 409, 'Course ID and date are required');
    }

    client = await connect();
    client.query('BEGIN');

    const id = await generatedId('ATT_INT');
    const qrTokenExpiration = new Date(Date.now() + 3 * 60 * 60 * 1000);

    const qrToken = jwt.sign(
      { courseId: courseId, instanceId: id },
      process.env.JWT_SECRET,
      { expiresIn: '3h' },
    );

    const { rows } = await client.query(
      `INSERT INTO attendance_instance (id, courseId, date, qr_token, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, courseId, date, expires_at;`,
      [id, courseId, date, qrToken, qrTokenExpiration],
    );

    const students = await client.query(
      `
        SELECT s.id AS studentId
        FROM COURSE_STUDENT cs
        JOIN STUDENT s ON cs.studentId = s.id
        WHERE cs.courseId = $1 AND s.status = 'active'
        `,
      [courseId],
    );

    for (const student of students.rows) {
      const attendanceId = await generatedId('ATT');
      await client.query(
        `INSERT INTO attendance (id, instanceId, courseId, date, studentId, status)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [attendanceId, id, courseId, date, student.studentid, 'absent'],
      );
    }
    await client.query('COMMIT');

    const attendanceUrl = `${process.env.FRONTEND_URL}/mark?instanceId=${id}&token=${qrToken}`;

    const qrImage = await generateQR(attendanceUrl);

    res.status(201).json({
      success: true,
      message: 'Attendance initialized successfully',
      qrImage: qrImage,
      data: rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    handleError(res, 500, 'Error initializing attendance', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.closeAttendance = async (req, res) => {
  let client;
  try {
    const { instanceId } = req.query;
    client = await connect();
    if (!instanceId) {
      return handleError(res, 409, 'Instance ID required');
    }

    const { rows } = await client.query(
      `SELECT is_close FROM attendance_instance WHERE id = $1`,
      [instanceId],
    );

    if (!rows.length) {
      return handleError(res, 404, 'Attendance not found');
    }

    rows[0].is_close
      ? handleError(res, 401, 'Attendance already closed')
      : await client.query(
          `UPDATE attendance_instance
                SET is_close = $1,
                qr_token = $2
                WHERE id = $3`,
          [true, '', instanceId],
        );
    return handleResponse(res, 200, 'Attendance successfully closed');
  } catch (error) {
    return handleError(res, 500, 'Error closing attendance', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.allAttendanceInstance = async (req, res) => {
  let client;
  try {
    client = await connect();

    const { rows } = await client.query(
      `SELECT 
            id,
            courseid AS course_id,
            date, 
            expires_at,
            is_close
         FROM attendance_instance`,
    );

    if (rows.length === 0) {
      return handleError(res, 400, 'No instance was found');
    }

    return handleResponse(res, 200, 'Instances successfully retrieved', rows);
  } catch (error) {
    return handleError(
      res,
      500,
      'Error retrieving attendance instances',
      error,
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteInstance = async (req, res) => {
  let client;
  try {
    const { instanceId } = req.params;
    client = await connect();

    await client.query(`DELETE FROM attendance_instance WHERE id = $1`, [
      instanceId,
    ]);

    return handleResponse(
      res,
      200,
      'Instance and all related attendance deleted successfully',
    );
  } catch (error) {
    return handleError(res, 500, 'Error deleting attendance instance', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.attendanceByQuery = async (req, res) => {
  let client;
  try {
    client = await connect();
    await client.query('BEGIN');

    const { date, studentId, courseId } = req.query;

    // Build dynamic query
    const conditions = [];
    const values = [];

    if (date) {
      values.push(date);
      conditions.push(`date = $${values.length}`);
    }

    if (studentId) {
      values.push(studentId);
      conditions.push(`studentId = $${values.length}`);
    }

    if (courseId) {
      values.push(courseId);
      conditions.push(`courseId = $${values.length}`);
    }

    let query = `SELECT * FROM attendance`;

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY date DESC`;

    const { rows } = await client.query(query, values);
    await client.query('COMMIT');

    return handleResponse(res, 200, 'Attendance fetched successfully', rows);
  } catch (error) {
    await client.query('ROLLBACK');
    return handleError(res, 500, 'Error retrieving attendance', error);
  } finally {
    if (client) client.release();
  }
};

exports.updateAttendeeStatus = async (req, res) => {
  let client;
  try {
    const { attendanceId, studentId } = req.query;
    if (!attendanceId || !studentId) {
      return handleError(res, 409, 'Missing data to update attendee status');
    }
    client = await connect();

    const { rows } = await client.query(
      `SELECT * FROM attendance
       WHERE id = $1 AND studentId = $2`,
      [attendanceId, studentId],
    );

    if (rows.length === 0) {
      return handleError(res, 404, 'Attendee not found');
    }

    await client.query(
      `UPDATE attendance SET
            status = $1
            WHERE id = $2 AND studentId = $3`,
      ['present', rows[0].id, rows[0].studentid],
    );

    return handleResponse(res, 202, 'Attendance successfully marked');
  } catch (error) {
    return handleError(res, 500, 'Error updating attendee', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteAttendance = async (req, res) => {
  let client;
  try {
    const { attendanceId } = req.params;

    client = await connect();

    await client.query(`DELETE FROM attendance WHERE id = $1`, [attendanceId]);

    return handleResponse(res, 200, 'Attendance deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting attendance', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.autoAttendanceMark = async (req, res) => {
  let client;
  try {
    const { studentId } = req.body;
    const { token } = req.query;

    if (!studentId || !token) {
      return handleError(res, 409, 'Missing required data to mark attendance');
    }

    client = await connect();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.instanceId || !decoded.courseId) {
      return handleError(res, 409, 'Invalid or expired attendance token');
    }

    const {
      rows: [instance],
    } = await client.query(
      `SELECT * FROM attendance_instance WHERE id = $1 AND courseId = $2`,
      [decoded.instanceId, decoded.courseId],
    );

    if (
      !instance ||
      new Date(instance.expires_at) < new Date() ||
      instance.is_close ||
      instance.qr_token !== token
    ) {
      return handleError(res, 403, 'Attendance is either expired or closed');
    }

    const {
      rows: [statusRow],
    } = await client.query(
      `SELECT status FROM attendance
       WHERE instanceId = $1 AND courseId = $2 AND studentId = $3`,
      [decoded.instanceId, decoded.courseId, studentId],
    );

    if (statusRow?.status === 'present') {
      return handleError(res, 409, 'Attendance already marked');
    }

    const now = new Date();

    if (!statusRow) {
      const id = await generatedId('ATT');
      await client.query(
        `INSERT INTO attendance (id, instanceId, courseId, date, studentId, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, decoded.instanceId, decoded.courseId, now, studentId, 'present'],
      );
      return handleResponse(res, 201, 'Attendance marked successfully');
    } else {
      await client.query(
        `UPDATE attendance
         SET status = $1
         WHERE instanceId = $2 AND courseId = $3 AND studentId = $4`,
        ['present', decoded.instanceId, decoded.courseId, studentId],
      );
      return handleResponse(res, 200, 'Attendance marked successfully');
    }
  } catch (error) {
    return handleError(res, 500, 'Error marking attendance', error);
  } finally {
    if (client) client.release();
  }
};
