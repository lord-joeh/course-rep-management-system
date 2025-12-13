const models = require("../config/models");
const bcrypt = require("bcrypt");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const { sendRegistrationSuccessMail } = require("../services/customEmails");
const { emitToUser, emitToUsers } = require("../middleware/socketTracker");

exports.registerStudent = async (req, res) => {
  try {
    const { id, name, email, phone, password } = req.body;
    if (!id || !name || !email || !phone || !password) {
      return handleError(
        res,
        400,
        "Student Id, name, email, phone, and password are required"
      );
    }
    let rep;
    if (!req.body.isRep) {
      rep = false;
    } else {
      rep = req.body.isRep;
    }
    const existingStudent = await models.Student.findOne({ where: { id } });
    if (existingStudent) {
      return handleError(res, 409, "Student already exist");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newStudent = await models.Student.create({
      id,
      name,
      email,
      phone,
      password_hash: hashedPassword,
      isRep: rep,
    });

    await sendRegistrationSuccessMail(
      newStudent.name,
      newStudent.email,
      newStudent.id
    );

    newStudent.password_hash = undefined;
    return handleResponse(
      res,
      201,
      "Student registered successfully",
      newStudent
    );
  } catch (error) {
    return handleError(res, 500, "Error registering student", error);
  }
};

exports.getAllStudent = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const result = await models.Student.findAndCountAll({
      order: [["name", "ASC"]],
      limit: limit,
      offset: offset,
    });

    const { rows: students, count: totalItems } = result;

    if (!students) {
      return handleError(res, 404, "No students found on this page");
    }

    const studentsWithoutPassword = students.map((student) => {
      const studentData = student.get({ plain: true });
      delete studentData.password_hash;
      return studentData;
    });

    const totalPages = Math.ceil(totalItems / limit);

    return handleResponse(res, 200, "Students retrieved successfully", {
      students: studentsWithoutPassword,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Error retrieving students:", error);
    return handleError(res, 500, "Error retrieving students");
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
          through: { attributes: ["isLeader"] },
          attributes: ["id", "name"],
          include: [
            {
              model: models.Course,
              attributes: ["name"],
            },
          ],
        },
      ],
    });
    if (!student) {
      return handleError(res, 404, "Student not found");
    }
    student.password_hash = undefined;
    return handleResponse(res, 200, "Student retrieved successfully", student);
  } catch (error) {
    return handleError(res, 500, "Error retrieving student", error);
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, isRep, status } = req.body;
    const [updated] = await models.Student.update(
      { name, email, phone, isRep, status },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, "Student not found for update");
    }
    const updatedStudent = await models.Student.findOne({ where: { id } });
    updatedStudent.password_hash = undefined;
    
    return handleResponse(
      res,
      200,
      "Your profile has been updated successfully",
      updatedStudent
    );
  } catch (error) {
    return handleError(res, 500, "Error updating student", error);
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await models.Student.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Student not found for deletion");
    }
    return handleResponse(res, 200, "Student deleted successfully");
  } catch (error) {
    return handleError(res, 500, "Error deleting student", error);
  }
};
