const express = require("express");
const { loginLimiter } = require("../middleware/rateLimiter");
const {
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  refreshToken,
  logout,
} = require("../controllers/auth.Controller");
const router = express.Router();

// Refresh token route
router.post("/refresh", refreshToken);

// Logout route
router.post("/logout", logout);

router.use(loginLimiter);

//Login route
router.post("/login", login);

//Forgot password route
router.post("/forgot", forgotPassword);

//Reset password route
router.post("/reset", resetPassword);

//Route to change password
router.post("/change", changePassword);

module.exports = router;
