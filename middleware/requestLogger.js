const logger = require("../config/logger");

exports.requestLogger = (req, res, next) => {
  const start = Date.now();

  // Wait for the response to finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.student ? req.student.id : "unauthenticated",
      ip: req.ip,
    };

    if (res.statusCode >= 400) {
      logger.warn("HTTP Request Failed", logData);
    } else {
      logger.info("HTTP Request Success", logData);
    }
  });

  next();
};
