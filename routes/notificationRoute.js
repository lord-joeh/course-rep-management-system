const express = require('express');
const router = express.Router();
const {
  addNotification,
  allNotification,
  notificationById,
  updateNotification,
  deleteNotification,
} = require('../controllers/notificationController');

//Route to add a notification
router.post('/', addNotification);

//Route to get all notifications
router.get('/', allNotification);

//Route to get notification
router.get('/:id', notificationById);

//Route to update notification
router.put('/:id', updateNotification);

//Route to delete notification
router.delete('/:id', deleteNotification);

module.exports = router;
