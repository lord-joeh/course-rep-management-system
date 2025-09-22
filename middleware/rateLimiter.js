const rateLimit = require("express-rate-limit");

exports.limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, 
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
});

exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many login attempts, please try again after 15 minutes.",
  },
});
