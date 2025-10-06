const express = require("express");
const router = express.Router();
const {
  addLecturer,
  getAllLecturer,
  getLecturerById,
  updateLecturer,
  deleteLecturer,
} = require("../controllers/lecturer.Controller");
const { authenticate, authorize } = require("../middleware/auth.Middleware");

router.use(authenticate);

//Route to add a new lecturer
router.post("/", authorize, addLecturer);

//Route to get all lecturers
router.get("/", getAllLecturer);

//Route to a lecturer by id
router.get("/:id", getLecturerById);

//Route to update a lecturer
router.put("/:id", authorize, updateLecturer);

//Route to delete a lecture
router.delete("/:id", authorize, deleteLecturer);

module.exports = router;
