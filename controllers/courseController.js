const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { connect } = require('../config/db');

exports.addCourse = async (req, res) => {
  let client;
  try {
    client = await connect();
    client.query('BEGIN');
    const { id, name, lecturerId, day, startTime, endTime, semester } =
      req.body;

    if (
      (!id || !name || !lecturerId || !day || !startTime || !endTime, !semester)
    ) {
      return handleError(
        res,
        409,
        'id, name, lecturerId, day, start time, end time, and semester is required',
      );
    }

    const newCourse = await client.query(
      `INSERT INTO course (id, name, lecturerId, day, start_time, end_time, semester)
        VALUES($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
      [id, name, lecturerId, day, startTime, endTime, semester],
    );

    const students = await client.query(`SELECT id FROM student`);

    for (const student of students.rows) {
      await client.query(
        `INSERT INTO course_student (courseId, studentId)
        VALUES ($1, $2)`,
        [newCourse.rows[0].id, student.id],
      );
    }
    client.query('COMMIT');

    return handleResponse(
      res,
      201,
      'Course added successfully',
      newCourse.rows[0],
    );
  } catch (error) {
    client.query('ROLLBACK');
    return handleError(res, 500, 'Error adding course', error);
  } finally {
    client.release();
  }
};

exports.getAllCourse = async (req, res) => {
  let client;
  try {
    client = await connect();
    const courses = await client.query(`SELECT * FROM course`);

    if (!courses.rows) {
      return handleError(res, 404, 'No course was found');
    }

    return handleResponse(
      res,
      200,
      'Courses retrieved successfully',
      courses.rows,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving courses', error);
  } finally {
    client.release();
  }
};

exports.getCourseById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();
    const course = await client.query(
      `
            SELECT 
            course.*, 
            lecturer.id AS lecturer_id, 
            lecturer.name AS lecturer_name, 
            lecturer.email AS lecturer_email, 
            lecturer.phone AS lecturer_phone,
            COUNT(course_student.studentid) AS total_students
            FROM course
            LEFT JOIN lecturer ON course.lecturerid = lecturer.id
            LEFT JOIN course_student ON course.id = course_student.courseid
            WHERE course.id = $1
            GROUP BY course.id, lecturer.id;`,
      [id],
    );

    if (!course.rows) {
      return handleError(res, 404, 'Course not found');
    }

    return handleResponse(
      res,
      200,
      'Course retrieved successfully',
      course.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving course', error);
  } finally {
    client.release();
  }
};

exports.updateCourse = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { name, lecturerId, day, startTime, endTime, semester } = req.body;
    client = await connect();

    const updatedCourse = await client.query(
      `UPDATE course
     SET name = $1,
         lecturerId = $2,
         day = $3,
         start_time = $4,
         end_time = $5,
         semester = $6
   WHERE id = $7
   RETURNING *;`,
      [name, lecturerId, day, startTime, endTime, semester, id],
    );
    return handleResponse(
      res,
      200,
      'Course updated successfully',
      updatedCourse.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating course', error);
  } finally {
    client.release();
  }
};

exports.deleteCourse = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();

    await client.query(`DELETE FROM course WHERE id = $1`, [id]);

    return handleResponse(res, 200, 'Course deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting course', error);
  } finally {
    client.release();
  }
};

exports.registerCourse = async (req, res) => {
  let client;
  try {
    const { courseId, studentId } = req.body;
    client = await connect();
    if (!courseId || !studentId) {
      return handleError(
        res,
        409,
        'Course ID and student ID required to register course',
      );
    }

    const registeredCourse = await client.query(
      `SELECT is_register FROM course_student WHERE courseId = $1 AND studentId = $2`,
      [courseId, studentId],
    );

    if (!registeredCourse.rows.length) {
      await client.query(
        `INSERT INTO course_student (courseId, studentId, is_register)
      VALUES($1, $2, $3)`,
        [courseId, studentId, true],
      );
      return handleResponse(res, 201, 'Course registered successfully');
    }

    if (registeredCourse.rows[0].is_register) {
      return handleError(res, 409, 'Course already registered');
    } else if (!registeredCourse.rows[0].is_register) {
      await client.query(
        `UPDATE course_student
          SET is_register = $1
          WHERE courseId = $2 AND studentId = $3`,
        [true, courseId, studentId],
      );
      return handleResponse(res, 200, 'Course register successfully');
    }
  } catch (error) {
    return handleError(res, 500, 'Error registering course', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.getCourseByStudentId = async (req, res) => {
  let client;
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return handleError(res, 409, 'Student ID required');
    }
    client = await connect();

    const studentCourse = await client.query(
      `SELECT 
        c.*,
        cs.is_register AS isRegistered,
        l.name AS lecturer_name
        FROM course c
        INNER JOIN course_student cs ON cs.courseid = c.id
        LEFT JOIN lecturer l ON c.lecturerid = c.lecturerid
        WHERE cs.studentId = $1`,
      [studentId],
    );

    if (!studentCourse.rows || studentCourse.rows.length === 0) {
      return handleError(res, 404, 'No courses found for this student');
    }
    if (studentCourse.rows.length > 0) {
      return handleResponse(
        res,
        200,
        'Courses retrieved successfully',
        studentCourse.rows,
      );
    }
  } catch (error) {
    return handleError(res, 500, 'Error retrieving courses for student', error);
  } finally {
    if (client) client.release();
  }
};
