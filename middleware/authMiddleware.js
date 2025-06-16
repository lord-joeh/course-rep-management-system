const jwt = require('jsonwebtoken');
const { connect } = require('../config/db');
const { handleError } = require('../services/errorService');

exports.authenticate = async (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) {
    return handleError(res, 401, 'No token provided.');
  }
  const client = await connect();

  try {
    const decoded = await jwt.verify(token, process.env.JWT_SECRET);

    const studentResult = await client.query(
      'SELECT * FROM student WHERE id = $1',
      [decoded.id],
    );

    if (
      !studentResult.rows ||
      !studentResult.rows.length === 0 ||
      !studentResult.rows[0]
    ) {
      return handleError(res, 401, 'Student not found or invalid token.');
    }

    req.student = studentResult.rows[0];

    next();
  } catch (error) {
    console.error('Authentication Error: ', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return handleError(res, 401, 'Invalid token');
    }

    return handleError(
      res,
      401,
      'Token verification or student retrieval error',
      error,
    );
  } finally {
    client.release();
  }
};
