const { models } = require('../config/db');
const bcrypt = require('bcrypt');
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { sendRegistrationSuccessMail } = require('../services/customEmails');

exports.registerStudent = async (req, res) => {
  try {
    const { id, name, email, phone, password } = req.body;
    if (!id || !name || !email || !phone || !password) {
      return handleError(
        res,
        409,
        'Student Id, name, email, phone, and password are required',
      );
    }
    //Check for existing student with same id
    const existingStudent = await models.Student.findOne({ where: { id } });
    if (existingStudent) {
      return handleError(res, 409, 'Student already exist');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newStudent = await models.Student.create({
      id,
      name,
      email,
      phone,
      password_hash: hashedPassword,
    });
    newStudent.password_hash = undefined;
    //Send registration mail
    sendRegistrationSuccessMail(newStudent.name, newStudent.email, newStudent.id);
    return handleResponse(
      res,
      201,
      'Student registered successfully',
      newStudent,
    );
  } catch (error) {
    return handleError(res, 500, 'Error registering student', error);
  }
};

exports.getAllStudent = async (req, res) => {
  try {
    const students = await models.Student.findAll({ order: [['name', 'ASC']] });
    if (!students.length) {
      return handleError(res, 409, 'No student found');
    }
    students.forEach((s) => (s.password_hash = undefined));
    return handleResponse(
      res,
      200,
      'Students retrieved successfully',
      students,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving students');
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await models.Student.findOne({
      where: { id },
      include: [
        {
          model: models.Group,
          through: { attributes: ['isLeader'] },
          attributes: ['id', 'name'],
        },
      ],
    });
    if (!student) {
      return handleError(res, 404, 'Student not found');
    }
    student.password_hash = undefined;
    return handleResponse(
      res,
      200,
      'Student retrieved successfully',
      student,
    );
  } catch (error) {
    return handleError(res, 500, 'Error retrieving student', error);
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;
    const [updated] = await models.Student.update(
      { name, email, phone },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, 'Student not found for update');
    }
    const updatedStudent = await models.Student.findOne({ where: { id } });
    updatedStudent.password_hash = undefined;
    return handleResponse(
      res,
      200,
      'Student updated successfully',
      updatedStudent,
    );
  } catch (error) {
    return handleError(res, 500, 'Error updating student', error);
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Student.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, 'Student not found for deletion');
    }
    return handleResponse(res, 200, 'Student deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting student', error);
  }
};
