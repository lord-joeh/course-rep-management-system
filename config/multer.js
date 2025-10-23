const multer = require("multer");

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, "uploads/temp/");
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
  fileFilter: (_req, file, cb) => {
    // allow certain mime types only
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type"), false);
  },
});

module.exports = upload;
