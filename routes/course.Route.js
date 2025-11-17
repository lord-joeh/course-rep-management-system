const express = require("express");
const router = express.Router();
const {
  addCourse,
  getAllCourse,
  getCourseById,
  updateCourse,
  deleteCourse,
  registerCourse,
  getCourseByStudentId,
} = require("../controllers/course.Controller");
const { authenticate, authorize } = require("../middleware/auth.Middleware");

router.use(authenticate);
//Route to add course
router.post("/", authorize, addCourse);

//Route to register course
router.post("/register", registerCourse);

//Route to get all course
router.get("/", getAllCourse);

// Route to get course by id
router.get("/:id", getCourseById);

//Route to get course by student id
router.get("/student/:studentId", getCourseByStudentId);

//Route to update a course
router.put("/:id", authorize, updateCourse);

//Route to delete a course
router.delete("/:id", authorize, deleteCourse);

module.exports = router;
