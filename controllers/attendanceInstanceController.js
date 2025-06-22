const { connect } = require('../config/db');
const { generatedId, generateQR } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const jwt = require('jsonwebtoken');
const { getDistance } = require('geolib');

exports.attendanceInstance = async (req, res) => {
  let client;
  try {
    const { courseId, date, classType } = req.body;

    // Validate required parameters
    if (!courseId || !date || !classType) {
      return handleError(
        res,
        409,
        'Course ID, date, and class type are required',
      );
    }

    // Validate class type
    if (!['physical', 'online'].includes(classType)) {
      return handleError(
        res,
        400,
        'Invalid class type. Must be "physical" or "online"',
      );
    }

    let latitude, longitude;

    if (classType === 'physical') {
      // Require location for physical classes
      if (!req.body.latitude || !req.body.longitude) {
        return handleError(
          res,
          409,
          'Location coordinates are required for physical classes',
        );
      }
      latitude = req.body.latitude;
      longitude = req.body.longitude;
    } else {
      // For online classes, location is optional
      latitude = req.body.latitude || 0;
      longitude = req.body.longitude || 0;
    }

    client = await connect();
    await client.query('BEGIN');

    const id = await generatedId('ATT_INT');
    const qrTokenExpiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Token payload includes class type
    const tokenPayload = {
      courseId,
      instanceId: id,
      classType,
      latitude,
      longitude,
    };

    const qrToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '15m',
    });

    // Store in database including class type
    const { rows } = await client.query(
      `INSERT INTO attendance_instance 
        (id, courseId, date, qr_token, expires_at, latitude, longitude, class_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, courseId, date, expires_at, class_type;`,
      [
        id,
        courseId,
        date,
        qrToken,
        qrTokenExpiration,
        latitude,
        longitude,
        classType,
      ],
    );

    // Create attendance records for students
    const students = await client.query(
      `SELECT s.id AS studentId
       FROM COURSE_STUDENT cs
       JOIN STUDENT s ON cs.studentId = s.id
       WHERE cs.courseId = $1 AND s.status = 'active'`,
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
      classType: classType,
      qrCode: qrImage,
      data: rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    handleError(res, 500, 'Error initializing attendance', error);
  } finally {
    if (client) client.release();
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
      return handleError(res, 409, 'Student ID and token are required');
    }

    client = await connect();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate token payload
    if (!decoded.instanceId || !decoded.courseId || !decoded.classType) {
      return handleError(res, 400, 'Invalid attendance token payload');
    }

    // Get attendance instance
    const {
      rows: [instance],
    } = await client.query(
      `SELECT * FROM attendance_instance 
       WHERE id = $1 AND courseId = $2`,
      [decoded.instanceId, decoded.courseId],
    );

    if (!instance) {
      return handleError(res, 404, 'Attendance session not found');
    }

    if (instance.is_close) {
      return handleError(res, 410, 'Attendance session is closed');
    }

    if (new Date(instance.expires_at) < new Date()) {
      return handleError(res, 410, 'Attendance session has expired');
    }

    if (instance.qr_token !== token) {
      return handleError(res, 401, 'Invalid attendance token');
    }

    // Location verification logic
    let locationRequired = false;
    let locationValid = false;
    let locationMessage = '';

    // For physical classes: always require location
    if (instance.class_type === 'physical') {
      locationRequired = true;

      if (!req.body.latitude || !req.body.longitude) {
        return handleError(res, 409, 'Location coordinates are required');
      }

      const distance = getDistance(
        { latitude: instance.latitude, longitude: instance.longitude },
        { latitude: req.body.latitude, longitude: req.body.longitude },
      );

      locationValid = distance <= 50;
      locationMessage = locationValid
        ? 'Location verified'
        : `You must be within 50m of the classroom (${distance}m away)`;
    }
    // For online classes: occasionally require random location check (20% chance)
    else if (instance.class_type === 'online') {
      // Random location check (20% probability)
      if (Math.random() < 0.2) {
        locationRequired = true;

        if (!req.body.latitude || !req.body.longitude) {
          return handleError(res, 409, 'Random location check required');
        }

        // For online classes, just require location but don't verify distance
        locationValid = true;
        locationMessage = 'Random location check completed';
      }
    }

    // If location was required but not provided or invalid
    if (locationRequired && !locationValid) {
      // Log suspicious activity
      await client.query(
        `INSERT INTO security_logs 
         (student_id, instance_id, event_type, details) 
         VALUES ($1, $2, $3, $4)`,
        [
          studentId,
          instance.id,
          'location_verification_failed',
          locationMessage,
        ],
      );

      return handleError(res, 403, locationMessage);
    }

    // Check existing attendance status
    const {
      rows: [attendance],
    } = await client.query(
      `SELECT status FROM attendance
       WHERE instanceId = $1 AND studentId = $2`,
      [decoded.instanceId, studentId],
    );

    // Prevent duplicate marking
    if (attendance?.status === 'present') {
      return handleError(res, 409, 'Attendance already marked');
    }

    // Create or update attendance record
    if (attendance) {
      await client.query(
        `UPDATE attendance
         SET status = 'present'
         WHERE instanceId = $1 AND studentId = $2`,
        [decoded.instanceId, studentId],
      );
    } else {
      const id = await generatedId('ATT');
      await client.query(
        `INSERT INTO attendance (id, instanceId, courseId, date, studentId, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          decoded.instanceId,
          decoded.courseId,
          new Date(),
          studentId,
          'present',
        ],
      );
    }

    // Log successful attendance with location status
    await client.query(
      `INSERT INTO attendance_logs 
       (student_id, instance_id, location_checked, location_valid, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        studentId,
        instance.id,
        locationRequired,
        locationValid,
        locationMessage,
      ],
    );

    return handleResponse(
      res,
      200,
      `Attendance marked successfully. ${locationMessage}`,
    );
  } catch (error) {
    return handleError(res, 500, 'Error marking attendance', error);
  } finally {
    if (client) client.release();
  }
};
