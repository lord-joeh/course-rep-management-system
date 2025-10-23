const models = require("../config/models");
const { sendFeedbackReceived } = require("../services/customEmails");
const { generatedId } = require("../services/customServices");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");

exports.sendFeedback = async (req, res) => {
  try {
    const { studentId, content, is_anonymous } = req.body;
    if (!studentId || !content) {
      return handleError(res, 400, "Student ID and content are required");
    }
    const id = await generatedId("FED");
      console.log(req.body)
    const newFeedback = await models.Feedback.create({
      id,
      studentId,
      content,
      is_anonymous: is_anonymous,
    });

      console.log(newFeedback);

      const payload = newFeedback.get ? newFeedback.get({ plain: true }) : { ...newFeedback };

      if (payload.is_anonymous) {
          delete payload.studentId;
          if (payload.Student) {
              payload.Student.name = "Anonymous";
              delete payload.Student.email;
          }
      }
    await sendFeedbackReceived(is_anonymous, studentId);
    return handleResponse(
      res,
      201,
      "Feedback submitted successfully",
      payload,
    );
  } catch (error) {
    return handleError(res, 500, "Error sending feedback", error);
  }
};

exports.allFeedback = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const result = await models.Feedback.findAndCountAll({
      include: [{ model: models.Student, attributes: ["name"] }],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    const { rows: feedbacks, count: totalItems } = result;

    if (!feedbacks.length) {
      return handleError(res, 404, "No feedbacks found");
    }

    feedbacks.map((feedback) => feedback.get ? feedback.get({plain: true}) : {...feedback})

    feedbacks.forEach((f) => {
      if (f?.is_anonymous) {
       delete f.studentId
        if (f.Student) f.Student.name = 'Anonymous';
      }
    });

    const totalPages = Math.ceil(totalItems / limit);

    return handleResponse(res, 200, "Feedbacks retrieved successfully", {
      feedbacks: feedbacks,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    return handleError(res, 500, "Error retrieving feedbacks");
  }
};

exports.feedbackById = async (req, res) => {
    try {
        const { id } = req.params;
        const feedbackInstance = await models.Feedback.findByPk(id, {
            include: [{ model: models.Student, attributes: ["name", "email"] }],
        });
        if (!feedbackInstance) {
            return handleError(res, 404, "Feedback not found");
        }

        const feedback = feedbackInstance.get
            ? feedbackInstance.get({ plain: true })
            : { ...feedbackInstance };

        if (feedback.is_anonymous) {
            delete feedback.studentId;
            if (feedback.Student) {
                feedback.Student.name = "Anonymous";
                delete feedback.Student.email;
            }
        }

        return handleResponse(res, 200, "Feedback retrieved successfully", feedback);
    } catch (error) {
        return handleError(res, 500, "Error retrieving feedback", error);
    }
}

exports.deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Feedback.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Feedback not found for deletion");
    }
    return handleResponse(res, 200, "Feedback deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting feedback", error);
  }
};
