const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.errors({ stack: true }),
  ),

  defaultMeta: {
    service: "course-rep-api",
    env: process.env.NODE_ENV,
  },

  transports: [
    new winston.transports.File({ filename: "logs/combined.log" }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.Console(),
  ],
});

module.exports = logger;
