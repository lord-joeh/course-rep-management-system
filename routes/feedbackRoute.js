const express = require('express');
const router = express.Router();
const {
  sendFeedback,
  allFeedback,
  feedbackById,
  deleteFeedback,
} = require('../controllers/feedbackController');

//Route to send feedback
router.post('/', sendFeedback);

//Route to get all feedbacks
router.get('/', allFeedback);

//Route to get feedback by id
router.get('/:id', feedbackById);

//Route to delete feedback
router.delete('/:id', deleteFeedback);

module.exports = router;
