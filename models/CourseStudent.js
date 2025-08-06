const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CourseStudent = sequelize.define('CourseStudent', {
    courseId: { type: DataTypes.STRING, primaryKey: true },
    studentId: { type: DataTypes.STRING, primaryKey: true },
    is_register: DataTypes.BOOLEAN,
  }, {
    tableName: 'course_student',
    timestamps: true,
  });

  CourseStudent.associate = (models) => {
    CourseStudent.belongsTo(models.Course, { foreignKey: 'courseId' });
    CourseStudent.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return CourseStudent;
};
