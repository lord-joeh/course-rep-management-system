const express = require("express");
const router = express.Router();
const {
  addAssignment,
  allAssignment,
  assignmentById,
  updateAssignment,
  deleteAssignment,
  uploadAssignment,
} = require("../controllers/assignmentController");
const upload = require('../config/multer')

//Route to add assignment
router.post("/", addAssignment);

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



module.exports = router;
