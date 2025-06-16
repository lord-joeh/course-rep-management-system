const express = require('express');
const router = express.Router();
const {
  addLecturer,
  getAllLecturer,
  getLecturerById,
  updateLecturer,
  deleteLecturer,
} = require('../controllers/lecturerController');

//Route to add a new lecturer
router.post('/', addLecturer);

//Route to get all lecturers
router.get('/', getAllLecturer);

//Route to a lecturer by id
router.get('/:id', getLecturerById);

//Route to update a lecturer
router.put('/:id', updateLecturer);

//Route to delete a lecture
router.delete('/:id', deleteLecturer)

module.exports = router;
