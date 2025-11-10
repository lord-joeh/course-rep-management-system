const express = require("express");
const router = express.Router();
const upload = require("../config/multer");
const {
  uploadSlide,
  filesInSlideFolder,
  deleteSlide,
  getSlidesByCourse,
} = require("../controllers/slides.Controller");
const { captureSocketId } = require("../middleware/socketTracker");
const { authenticate, authorize } = require("../middleware/auth.Middleware");

router.use(authenticate);

router.use(captureSocketId);

// Route to get all slides by course
router.get("/", getSlidesByCourse);

router.use(authorize);

// Route to upload slide
router.post("/upload", upload.array("files", 10), uploadSlide);

// Route to get all files in course folder
router.get("/search", filesInSlideFolder);

// Route to delete slide
router.delete("/:slideId/delete", deleteSlide);
module.exports = router;
