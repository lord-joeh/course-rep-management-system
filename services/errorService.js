require('dotenv').config();
const logger = require('../config/logger');
exports.handleError = (res, statusCode, message, error = null) => {
  // Log the error details for debugging
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

  // In production, don't send error details to client
  const responseMessage =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : message;

  return res.status(statusCode).json({
    success: false,
    error: responseMessage,
  });
};