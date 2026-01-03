const multer = require("multer");

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

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, "uploads/temp/");
    },
    filename: (_req, file, callback) => {
      callback(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max file size
  fileFilter: (_req, file, callback) => {
    // allow certain mime types only
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) callback(null, true);
    else callback(new Error(`Unsupported file type: ${file.mimetype}`), false);
  },
});

module.exports = upload;
