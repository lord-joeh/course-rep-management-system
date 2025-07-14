const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Course = sequelize.define('Course', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    lecturerId: DataTypes.STRING,
    day: DataTypes.STRING,
    start_time: DataTypes.STRING,
    end_time: DataTypes.STRING,
    semester: DataTypes.STRING,
  }, {
    tableName: 'course',
    timestamps: false,
  });
  Course.associate = (models) => {
    Course.belongsTo(models.Lecturer, { foreignKey: 'lecturerId' });
    Course.hasMany(models.Assignment, { foreignKey: 'courseId' });
    Course.hasMany(models.Group, { foreignKey: 'courseId' });
    Course.hasMany(models.AttendanceInstance, { foreignKey: 'courseId' });
    Course.belongsToMany(models.Student, {
      through: models.CourseStudent,
      foreignKey: 'courseId',
      otherKey: 'studentId',
    });
  };
  return Course;
};
