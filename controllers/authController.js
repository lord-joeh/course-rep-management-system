const models = require("../config/models");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { sendResetLink } = require("../services/customEmails");
require("dotenv").config();
const { Op } = require('sequelize');

exports.login = async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return handleError(res, 409, "Student ID and Password are required");
    }

    const student = await models.Student.findOne({ where: { id: studentId } });

    if (!student) {
      return handleError(res, 404, "Student does not exist");
    }

    const isMatch = await bcrypt.compare(password, student.password_hash);

    if (!isMatch) {
      return handleError(res, 400, "Invalid credentials");
    }

    student.password_hash = undefined;

    const token = jwt.sign(
      {
        id: student.id,
        email: student.email,
        isRep: student.isRep,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: token,
      refreshToken: token,
      data: student,
    });
  } catch (error) {
    return handleError(res, 500, "Error logging in", error);
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return handleError(res, 400, "Student ID required");
    }
    const student = await models.Student.findOne({
      where: { id: studentId },
      include: [{ model: models.Verification, required: false }],
    });
    if (!student) {
      return handleError(res, 404, "Student not found");
    }
    const resetToken = jwt.sign(
      { id: student.id, email: student.email },
      process.env.JWT_RESET,
      { expiresIn: "5m" }
    );
    const resetTokenExpiration = new Date(Date.now() + 5 * 60 * 1000);
    await models.Verification.upsert({
      student_id: student.id,
      reset_token: resetToken,
      reset_token_expiration: resetTokenExpiration,
    });
    await sendResetLink(student.email, resetToken);
    return handleResponse(
      res,
      200,
      "Reset link sent. Check your mail and click on the button to reset your password"
    );
  } catch (error) {
    return handleError(res, 500, "Error requesting reset password link", error);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { token } = req.query;

    if (!newPassword || typeof newPassword !== 'string') {
      return handleError(res, 400, 'New password is required and must be a string');
    }
    if (!token || typeof token !== 'string') {
      return handleError(res, 400, 'Password reset token is missing or invalid');
    }
    if (newPassword.length < 8) {
      return handleError(res, 400, 'Password must be at least 8 characters long');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_RESET);
      if (!decoded.id || !decoded.email) {
        return handleError(res, 401, 'Invalid token payload');
      }
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return handleError(res, 401, 'Password reset token has expired');
      }
      return handleError(res, 401, 'Invalid password reset token');
    }
    const verification = await models.Verification.findOne({
      where: {
        student_id: decoded.id,
        reset_token: token,
        reset_token_expiration: { [Op.gt]: new Date() },
      },
    });

    if (!verification) {
      return handleError(res, 401, 'Invalid or expired token');
    }

    const student = await models.Student.findOne({
      where: {
        id: decoded.id,
        email: decoded.email,
      },
    });

    if (!student) {
      return handleError(res, 404, 'User not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await Promise.all([
      models.Student.update(
        { password_hash: hashedPassword },
        { where: { id: decoded.id, email: decoded.email } }
      ),
      verification.destroy(),
    ]);

    return handleResponse(res, 200, 'Password has been successfully reset');
  } catch (error) {
    console.error('Password reset error:', {
      error: error.message,
      stack: error.stack,
    });
    return handleError(res, 500, 'An error occurred while resetting the password');
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { student_id } = req.query;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return handleError(res, 409, "Current and new password required");
    }

    const student = await models.Student.findOne({ where: { id: student_id } });
    if (!student) {
      return handleError(
        res,
        404,
        "Can not change the password of this account"
      );
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      student.password_hash
    );
    if (!isMatch) {
      return handleError(res, 400, "Invalid password for current password");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await models.Student.update(
      { password_hash: hashedPassword },
      { where: { id: student_id } }
    );

    return handleResponse(res, 200, "Password successfully changed");
  } catch (error) {
    return handleError(res, 500, "Error changing password", error);
  }
};
