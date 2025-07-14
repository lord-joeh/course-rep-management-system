const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AttendanceLog = sequelize.define('AttendanceLog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    student_id: DataTypes.STRING,
    instance_id: DataTypes.STRING,
    location_checked: DataTypes.BOOLEAN,
    location_valid: DataTypes.BOOLEAN,
    details: DataTypes.STRING,
  }, {
    tableName: 'attendance_logs',
    timestamps: true,
  });
  return AttendanceLog;
};
