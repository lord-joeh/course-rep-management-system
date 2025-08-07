const express = require("express");
const router = express.Router();
const upload = require("../config/multer");
const {
  googleAuth,
  googleCallback,
  revokeGoogleAccess,
  downloadFile,
  searchFile,
  createFolder,
  uploadToFolder,
  deleteFile,
} = require("../controllers/googleController");

// Route for google auth
router.get("/", googleAuth);

// Route for google auth callback
router.get("/callback", googleCallback);

// Route to revoke google access
router.post("/revoke", revokeGoogleAccess);

// Route to download drive files
router.get("/download", downloadFile);

// Route to search files
router.get("/search", searchFile);

// Route to  create new drive folder
router.post("/folder", createFolder);

// Route to upload file to folder
router.post("/file", upload.single("file"), uploadToFolder);

// Route to delete file
router.delete("/:fileId/delete", deleteFile);

module.exports = router;
