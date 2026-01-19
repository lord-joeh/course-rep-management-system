const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
  "video/mp4",
  "application/vnd.ms-excel",
]);

// Ensure the destination directory exists
const uploadDir = path.join(__dirname, "uploads/temp/");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadDir);
    },
    filename: (_req, file, callback) => {
      // a unique name to prevent collisions
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      callback(null, uniqueSuffix + "-" + file.originalname);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max file size

  fileFilter: (_req, file, callback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      // Accept the file
      callback(null, true);
    } else {
      // Reject the file with a specific Multer error
      const error = new multer.MulterError("LIMIT_UNSUPPORTED_MIMETYPE");
      ((error.message = `Unsupported file type: %s`), file.mimetype);
      callback(error, false);
    }
  },
});

module.exports = upload;
