const express = require("express");
const router = express.Router();
const {
  attendanceInstance,
  closeAttendance,
  allAttendanceInstance,
  attendanceByInstance,
  updateAttendeeStatus,
  deleteInstance,
  deleteAttendance,
  autoAttendanceMark,
} = require("../controllers/attendanceInstance.Controller");

//Route to  initialize attendance
router.post("/initialize", attendanceInstance);

//Route to close attendance
router.post("/close", closeAttendance);

//Route to get all instances
router.get("/", allAttendanceInstance);

//Route to get attendance by Instance ID
router.get("/:instanceId", attendanceByInstance);

//Route to manually mark attendance
router.put("/mark", updateAttendeeStatus);

//Route to automatically mark attendance
router.post("/auto/mark", autoAttendanceMark);

//Route to delete attendance instance
router.delete("/instance/:instanceId", deleteInstance);

//Route to delete attendance
router.delete("/:attendanceId", deleteAttendance);
module.exports = router;
