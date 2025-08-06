const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attendance = sequelize.define('Attendance', {
    id: { type: DataTypes.STRING, primaryKey: true },
    instanceId: DataTypes.STRING,
    courseId: DataTypes.STRING,
    date: DataTypes.DATE,
    studentId: DataTypes.STRING,
    status: DataTypes.STRING,
  }, {
    tableName: 'attendance',
    timestamps: true,
  });
  Attendance.associate = (models) => {
    Attendance.belongsTo(models.AttendanceInstance, { foreignKey: 'instanceId' });
    Attendance.belongsTo(models.Course, { foreignKey: 'courseId' });
    Attendance.belongsTo(models.Student, { foreignKey: 'studentId' });
  };
  return Attendance;
};
