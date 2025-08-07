const express = require("express");
const router = express.Router();
const upload = require("../config/multer");
const {
  uploadSlide,
  filesInSlideFolder,
  deleteSlide,
} = require("../controllers/slidesController");

// Route to upload slide
router.post("/upload", upload.array("files", 10), uploadSlide);

// Route to get all files in course folder
router.get("/search", filesInSlideFolder);

// Route to delete slide
router.delete("/:slideId/delete", deleteSlide);
module.exports = router;
