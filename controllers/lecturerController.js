require('dotenv').config();
const { handleError } = require('../services/errorService');
const { handleResponse } = require('../services/responseService');
const { models } = require('../config/db');
const { generatedId } = require('../services/customServices');

exports.addLecturer = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      return handleError(res, 400, 'name, email, phone are required');
    }
    const id = await generatedId('LECT');
    // check for existing lecturer
    const existingLecturer = await models.Lecturer.findOne({ where: { email } });
    if (existingLecturer) {
      return handleError(res, 409, 'Email is already registered');
    }
    const newLecturer = await models.Lecturer.create({ id, name, email, phone });
    return handleResponse(res, 201, 'Lecturer added successfully', newLecturer);
  } catch (error) {
    return handleError(res, 500, 'Error adding lecturer', error);
  }
};

exports.getAllLecturer = async (req, res) => {
  try {
    const lecturers = await models.Lecturer.findAll();
    if (!lecturers.length) {
      return handleError(res, 404, 'No lecturer was found');
    }
    return handleResponse(res, 200, 'Lecturers retrieved successfully', lecturers);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving lecturers', error);
  }
};

exports.getLecturerById = async (req, res) => {
  try {
    const { id } = req.params;
    const lecturer = await models.Lecturer.findOne({
      where: { id },
      include: [
        {
          model: models.Course,
          attributes: ['id', 'name', 'day', 'start_time', 'end_time', 'semester'],
        },
      ],
    });
    if (!lecturer) {
      return handleError(res, 404, 'Lecturer not found');
    }
    return handleResponse(res, 200, 'Lecturer retrieved successfully', lecturer);
  } catch (error) {
    return handleError(res, 500, 'Error retrieving lecturer', error);
  }
};

exports.updateLecturer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      return handleError(res, 409, 'name, email, and phone are required');
    }
    const [updated] = await models.Lecturer.update(
      { name, email, phone },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, 'Lecturer not found');
    }
    const updatedLecturer = await models.Lecturer.findOne({ where: { id } });
    return handleResponse(res, 202, 'Lecturer updated successfully', updatedLecturer);
  } catch (error) {
    return handleError(res, 500, 'Error updating lecturer', error);
  }
};

exports.deleteLecturer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Lecturer.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, 'Lecturer not found for deletion');
    }
    return handleResponse(res, 200, 'Lecturer deleted successfully');
  } catch (error) {
    return handleError(res, 500, 'Error deleting lecturer', error);
  }
};
