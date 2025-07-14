const { models } = require('../config/db');
const { sendFeedbackReceived } = require('../services/customEmails');
const { generatedId } = require('../services/customServices');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');

exports.sendFeedback = async (req, res) => {
  try {
    const { studentId, content, isAnonymous } = req.body;
    if (!studentId || !content) {
      return handleError(res, 409, 'Student ID and content are required');
    }
    const id = await generatedId('FED');
    const newFeedback = await models.Feedback.create({
      id,
      studentId,
      content,
      is_anonymous: isAnonymous,
    });
    await sendFeedbackReceived(isAnonymous, studentId);
    return handleResponse(res, 201, 'Feedback submitted successfully', newFeedback);
  } catch (error) {
    return handleError(res, 500, 'Error sending feedback', error);
  }
};

exports.allFeedback = async (req, res) => {
  try {
    const feedbacks = await models.Feedback.findAll({
      include: [{ model: models.Student, attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    });
    if (!feedbacks.length) {
      return handleError(res, 404, 'No feedbacks found');
    }
    feedbacks.forEach((f) => {
      if (f.is_anonymous) {
        f.studentId = undefined;
        if (f.Student) f.Student.name = undefined;
      }
    });
    return handleResponse(res, 200, 'Feedbacks retrieved successfully', feedbacks);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving feedbacks');
  }
};

exports.feedbackById = async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = await models.Feedback.findOne({
      where: { id },
      include: [{ model: models.Student, attributes: ['name', 'email'] }],
    });
    if (!feedback) {
      return handleError(res, 404, 'Feedback not found');
    }
    if (feedback.is_anonymous) {
      feedback.studentId = undefined;
      if (feedback.Student) {
        feedback.Student.name = undefined;
        feedback.Student.email = undefined;
      }
    }
    return handleResponse(res, 200, 'Feedback retrieved successfully', feedback);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving feedback', error);
  }
};

exports.deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Feedback.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, 'Feedback not found for deletion');
    }
    return handleResponse(res, 200, 'Feedback deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting feedback', error);
  }
};
