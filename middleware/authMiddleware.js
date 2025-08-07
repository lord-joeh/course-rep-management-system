const jwt = require("jsonwebtoken");
const models = require("../config/models");
const { handleError } = require("../services/errorService");

exports.authenticate = async (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return handleError(res, 401, "No token provided.");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const student = await models.Student.findOne({
      where: { id: decoded.id },
    });

    if (!student) {
      return handleError(res, 401, "Student not found or invalid token.");
    }

    req.student = student;
    next();
  } catch (error) {
    console.error("Authentication Error: ", error);
    if (error instanceof jwt.JsonWebTokenError) {
      return handleError(res, 401, "Invalid token");
    }
    return handleError(res, 401, "Token verification error", error);
  }
};

exports.authorize = async (req, res, next) => {
  try {
    if (!req.student) return handleError(res, 400, "Student not authenticated");

    if (!req.student.isRep) return handleError(res, 403, "Unathorize access");

    next();
  } catch (error) {
    return handleError(res, 500, "Error authorizing user", error);
  }
};
