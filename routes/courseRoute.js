const express = require('express');
const router = express.Router();
const {
  addCourse,
  getAllCourse,
  getCourseById,
  updateCourse,
  deleteCourse,
} = require('../controllers/courseController');
const { route } = require('./lecturerRoute');

//Route to add course
router.post('/', addCourse);

//Route to get all course
router.get('/', getAllCourse);

// Route to get course by id
router.get('/:id', getCourseById);

//Route to update a course
router.put('/:id', updateCourse);

//Route to delete a course
router.delete('/:id', deleteCourse);

module.exports = router;
