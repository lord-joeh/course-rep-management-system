const logger = require("../config/logger");

exports.handleResponse = (res, statusCode, message, data) => {
  logger.info(message, statusCode);

  return res.status(statusCode).json({
    success: true,
    message: message,
    data: data,
  });
};
