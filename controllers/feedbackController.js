const { connect } = require('../config/db');
const { sendFeedbackReceived } = require('../services/customEmails');
const { generatedId } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.sendFeedback = async (req, res) => {
  let client;
  try {
    const { studentId, content, isAnonymous } = req.body;
    if (!studentId || !content) {
      return handleError(res, 409, 'Student ID and content are required');
    }

    const id = await generatedId('FED');
    client = await connect();

    const newFeedback = await client.query(
      `INSERT INTO feedback (id, studentId, content, is_anonymous)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
      [id, studentId, content, isAnonymous],
    );

    await sendFeedbackReceived(isAnonymous, studentId);
    return handleResponse(
      res,
      201,
      'Feedback submitted successfully',
      newFeedback.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error sending feedback', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.allFeedback = async (req, res) => {
  let client;
  try {
    client = await connect();
    const feedbacks = await client.query(
      `SELECT 
        f.*,
        s.name AS student_name
        FROM feedback f
        LEFT JOIN student s ON f.studentid = s.id
        ORDER BY submitted_at DESC;`,
    );
    if (!feedbacks.rows.length) {
      return handleError(res, 404, 'No feedbacks found');
    }

    feedbacks.rows.map((f) => {
      if (f.is_anonymous) {
        f.studentid = undefined;
        f.student_name = undefined;
      }
    });

    return handleResponse(
      res,
      200,
      'Feedbacks retrieved successfully',
      feedbacks.rows,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving feedbacks');
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.feedbackById = async (req, res) => {
  let client;
  try {
    const { id } = req.params;

    client = await connect();

    const feedback = await client.query(
      `SELECT f.*,
            s.name AS student_name,
            s.email AS student_email
            FROM feedback f
            LEFT JOIN student s ON f.studentid = s.id
            WHERE f.id = $1`,
      [id],
    );
    if (!feedback.rows.length) {
      return handleError(res, 404, 'Feedback not found');
    }

    if (feedback.rows[0].is_anonymous) {
      feedback.rows[0].student_name = undefined;
      feedback.rows[0].studentid = undefined;
      feedback.rows[0].student_email = undefined;
    }

    return handleResponse(
      res,
      200,
      'Feedback retrieved successfully',
      feedback.rows[0],
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving feedback', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

exports.deleteFeedback = async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await connect();
    await client.query(`DELETE FROM feedback WHERE id = $1`, [id]);

    return handleResponse(res, 200, 'Feedback deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting feedback', error);
  } finally {
    if (client) {
      client.release();
    }
  }
};
