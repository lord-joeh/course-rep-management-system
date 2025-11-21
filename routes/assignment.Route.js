const express = require("express");
const router = express.Router();
const {
  addAssignment,
  allAssignment,
  assignmentById,
  updateAssignment,
  deleteAssignment,
  uploadAssignment,
  getAssignmentByCourse,
  getStudentSubmittedAssignments,
} = require("../controllers/assignment.Controller");
const upload = require("../config/multer");


//Route to add assignment
router.post("/", upload.single("file"), addAssignment);

//Route to upload assignment
router.post("/upload", upload.single("file"), uploadAssignment);

//Route to get all assignments
router.get("/", allAssignment);

//Route to get assignment
router.get("/:id", assignmentById);

//Route update assignment
router.put("/:id", updateAssignment);

//Route to delete assignment
router.delete("/:id", deleteAssignment);

//Route to get assignments submitted by a student
router.get("/student/:studentId", getStudentSubmittedAssignments);

// Route to get assignments by course
router.get("/course/:courseId", getAssignmentByCourse)

module.exports = router;
