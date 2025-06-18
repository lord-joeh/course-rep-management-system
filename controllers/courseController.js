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
      handleError(
        res,
        409,
        'id, name, lecturerId, day, start time, end time, and semester is required',
      );
    }

    const newCourse = client.query(
      `INSERT INTO course (id, name, lecturerId, day, start_time, end_time, semester)
        VALUES($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
      [id, name, lecturerId, day, startTime, endTime, semester],
    );

    client.query('COMMIT');
    handleResponse(
      res,
      201,
      'Course added successfully',
      (await newCourse).rows[0],
    );
  } catch (error) {
    client.query('ROLLBACK');
    handleError(res, 500, 'Error adding course', error);
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
      handleError(res, 404, 'No course was found');
    }

    handleResponse(res, 200, 'Courses retrieved successfully', courses.rows);
  } catch (error) {
    handleError(res, 500, 'Error retrieving courses', error);
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
      handleError(res, 404, 'Course not found');
    }

    handleResponse(res, 200, 'Course retrieved successfully', course.rows[0]);
  } catch (error) {
    handleError(res, 500, 'Error retrieving course', error);
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
    handleResponse(
      res,
      200,
      'Course updated successfully',
      updatedCourse.rows[0],
    );
  } catch (error) {
    handleError(res, 500, 'Error updating course', error);
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

    handleResponse(res, 200, 'Course deleted successfully');
  } catch (error) {
    handleError(res, 500, 'Error deleting course', error);
  } finally {
    client.release();
  }
};
