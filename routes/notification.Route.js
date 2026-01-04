const express = require("express");
const router = express.Router();
const {
  addNotification,
  allNotification,
  notificationById,
  updateNotification,
  deleteNotification,
  sendNotificationToStudent,
  markAllAsRead,
  markAsRead,
} = require("../controllers/notification.Controller");
const { authenticate, authorize } = require("../middleware/auth.Middleware");
router.use(authenticate);

//Route to add a notification
router.post("/", authorize, addNotification);

//Route to get all notifications
router.get("/", allNotification);

//Route to get notification
router.get("/:id", notificationById);

//Route to update notification
router.put("/:id", authorize, updateNotification);

//Route to delete notification
router.delete("/:id", authorize, deleteNotification);

//Route to send message to student
router.post("/send", authorize, sendNotificationToStudent);

//Route to mark notification as read
router.patch("/:id/read", markAsRead);

// Route to mark all notifications as read
router.patch("/read-all", markAllAsRead);

module.exports = router;
