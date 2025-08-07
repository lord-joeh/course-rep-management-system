const  models  = require("../config/models");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { sendResetLink } = require("../services/customEmails");
require("dotenv").config();

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
      data: student,
    });
  } catch (error) {
    return handleError(res, 500, "Error logging in", error);
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { studentId, email } = req.body;
    if (!studentId || !email) {
      return handleError(res, 409, "Student ID and email required");
    }
    const student = await models.Student.findOne({
      where: { id: studentId, email },
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
      "Reset link sent if email provided is correct"
    );
  } catch (error) {
    return handleError(res, 500, "Error requesting reset password link", error);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { token } = req.query;
    if (!newPassword) {
      return handleError(res, 409, "New password is required");
    }
    const decoded = jwt.verify(token, process.env.JWT_RESET);
    const now = new Date();
    const verification = await models.Verification.findOne({
      where: {
        student_id: decoded.id,
        reset_token: token,
        reset_token_expiration: { [models.Verification.sequelize.Op.gt]: now },
      },
    });
    if (!verification) {
      return handleError(
        res,
        409,
        "Invalid or Expired token. Request link again"
      );
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await models.Student.update(
      { password_hash: hashedPassword },
      { where: { id: decoded.id, email: decoded.email } }
    );
    return handleResponse(res, 200, "Password has successfully been reset");
  } catch (error) {
    return handleError(res, 500, "Error resetting password", error);
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

