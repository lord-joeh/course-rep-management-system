const express = require('express');
const {
  login,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authController');
const router = express.Router();

//Login route
router.post('/login', login);

//Forgot password route
router.post('/forgot', forgotPassword);

//Reset password route
router.post('/reset', resetPassword);

//Route to change password
router.post('/change', changePassword);

module.exports = router;
