const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const models = require("../config/models");
const createFolder = require("../googleServices/createDriveFolder");
const deleteFile = require("../googleServices/deleteFile");
const { error } = require("winston");

exports.addCourse = async (req, res) => {
  try {
    const { id, name, lecturerId, day, start_time, end_time, semester } =
      req.body;
    if (
      !id ||
      !name ||
      !lecturerId ||
      !day ||
      !start_time ||
      !end_time ||
      !semester
    ) {
      return handleError(
        res,
        400,
        "id, name, lecturerId, day, start time, end time, and semester is required"
      );
    }
    const folderId = await createFolder(`${name} Slides`);
    const newCourse = await models.Course.create({
      id,
      name,
      lecturerId,
      day,
      start_time,
      end_time,
      semester,
      slidesFolderID: folderId?.id,
    });

    const students = await models.Student.findAll({ attributes: ["id"] });
    for (const student of students) {
      await models.CourseStudent.create({
        courseId: newCourse.id,
        studentId: student.id,
        is_register: true,
      });
    }
    return handleResponse(res, 201, "Course added successfully", newCourse);
  } catch (error) {
    return handleError(res, 500, "Error adding course", error);
  }
};

exports.getAllCourse = async (req, res) => {
  try {
    const courses = await models.Course.findAll();
    if (!courses.length) {
      return handleError(res, 404, "No course was found");
    }
    return handleResponse(res, 200, "Courses retrieved successfully", courses);
  } catch (error) {
    return handleError(res, 500, "Error retrieving courses", error);
  }
};

exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await models.Course.findOne({
      where: { id },
      include: [
        {
          model: models.Lecturer,
          attributes: ["name", "email", "phone"],
        },
        { model: models.CourseStudent, attributes: [] },
      ],
    });
    if (!course) {
      return handleError(res, 404, "Course not found");
    }
    return handleResponse(res, 200, "Course retrieved successfully", course);
  } catch (error) {
    return handleError(res, 500, "Error retrieving course", error);
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lecturerId, day, start_time, end_time, semester } = req.body;
    const [updated] = await models.Course.update(
      {
        name,
        lecturerId,
        day,
        start_time,
        end_time,
        semester,
      },
      { where: { id }, returning: true }
    );
    if (!updated) {
      return handleError(res, 404, "Course not found for update");
    }
    const updatedCourse = await models.Course.findOne({ where: { id } });
    return handleResponse(
      res,
      200,
      "Course updated successfully",
      updatedCourse
    );
  } catch (error) {
    return handleError(res, 500, "Error updating course", error);
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const foundCourse = await models.Course.findOne({ where: { id } });
    const deleted = await models.Course.destroy({ where: { id } });
    if (!deleted) {
      return handleError(res, 404, "Course not found for deletion");
    }
    if (foundCourse) {
      await deleteFile(foundCourse?.slidesFolderID);
    } else {
      throw error;
    }

    return handleResponse(
      res,
      200,
      "Course and it's slides folder has been deleted successfully"
    );
  } catch (error) {
    return handleError(res, 500, "Error deleting course", error);
  }
};

exports.registerCourse = async (req, res) => {
  try {
    const { courseId, studentId } = req.body;
    if (!courseId || !studentId) {
      return handleError(
        res,
        400,
        "Course ID and student ID required to register course"
      );
    }
    const registeredCourse = await models.CourseStudent.findOne({
      where: { courseId, studentId },
    });
    if (!registeredCourse) {
      await models.CourseStudent.create({
        courseId,
        studentId,
        is_register: true,
      });
      return handleResponse(res, 201, "Course registered successfully");
    }
    if (registeredCourse.is_register) {
      return handleError(res, 409, "Course already registered");
    } else {
      registeredCourse.is_register = true;
      await registeredCourse.save();
      return handleResponse(res, 201, "Course registered successfully");
    }
  } catch (error) {
    return handleError(res, 500, "Error registering course", error);
  }
};

exports.getCourseByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return handleError(res, 409, "Student ID required");
    }
    const studentCourses = await models.Course.findAll({
      include: [
        {
          model: models.CourseStudent,
          where: { studentId },
          attributes: ["is_register"],
        },
      ],
    });
    if (!studentCourses.length) {
      return handleError(res, 404, "No courses found for this student");
    }
    return handleResponse(
      res,
      200,
      "Courses retrieved successfully",
      studentCourses
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving courses for student", error);
  }
};
