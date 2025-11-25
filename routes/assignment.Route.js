const express = require("express");
const router = express.Router();
const {
  addAssignment,
  allAssignment,
  assignmentById,
  updateAssignment,
  deleteAssignment,
  uploadAssignment,
  getStudentSubmittedAssignments,
} = require("../controllers/assignment.Controller");
const upload = require("../config/multer");
const { authenticate, authorize } = require("../middleware/auth.Middleware");

router.use(authenticate);
//Route to add assignment
router.post("/", authorize, upload.single("file"), addAssignment);

//Route to upload assignment
router.post("/upload", upload.single("file"), uploadAssignment);

//Route to get all assignments
router.get("/", allAssignment);

//Route to get assignment
router.get("/:id", authorize, assignmentById);

//Route update assignment
router.put("/:id", authorize, updateAssignment);

//Route to delete assignment
router.delete("/:id", authorize, deleteAssignment);

//Route to get assignments submitted by a student
router.get("/student/:studentId", getStudentSubmittedAssignments);

module.exports = router;
