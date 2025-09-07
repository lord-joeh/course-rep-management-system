const express = require("express");
const router = express.Router();
const {
  registerStudent,
  getAllStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
} = require("../controllers/studentController");
const { authenticate } = require("../middleware/authMiddleware");



//Route to register a student
router.post("/", registerStudent);

router.use(authenticate);

// Route to get all student
router.get("/", getAllStudent);

//Route to get student by id
router.get("/:id", getStudentById);

//Route to update student
router.put("/:id", updateStudent);

//Route to delete student
router.delete("/:id", deleteStudent);

module.exports = router;
