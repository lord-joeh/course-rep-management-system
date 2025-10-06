const express = require("express");
const router = express.Router();
const {
  sendFeedback,
  allFeedback,
  feedbackById,
  deleteFeedback,
} = require("../controllers/feedback.Controller");

const { authenticate, authorize } = require("../middleware/auth.Middleware");

router.use(authenticate);

//Route to send feedback
router.post("/", sendFeedback);

//Route to get all feedbacks
router.get("/", authorize, allFeedback);

//Route to get feedback by id
router.get("/:id", feedbackById);

//Route to delete feedback
router.delete("/:id", authorize, deleteFeedback);

module.exports = router;
