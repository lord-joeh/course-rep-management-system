require("dotenv").config();
const logger = require("../config/logger");
exports.handleError = (res, statusCode, message, error = null) => {
  if (error) {
    logger.error({
      message: message,
      error: error.message,
      stack: error.stack,
      statusCode: statusCode,
    });
  } else {
    logger.error(message);
  }

  return res.status(statusCode).json({
    success: false,
    error: message,
  });
};
