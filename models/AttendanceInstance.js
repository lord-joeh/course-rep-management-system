const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AttendanceInstance = sequelize.define('AttendanceInstance', {
    id: { type: DataTypes.STRING, primaryKey: true },
    courseId: DataTypes.STRING,
    date: DataTypes.DATE,
    qr_token: DataTypes.STRING,
    expires_at: DataTypes.DATE,
    latitude: DataTypes.FLOAT,
    longitude: DataTypes.FLOAT,
    class_type: DataTypes.STRING,
    is_close: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    tableName: 'attendance_instance',
    timestamps: true,
  });

  AttendanceInstance.associate = (models) => {
    AttendanceInstance.belongsTo(models.Course, { foreignKey: 'courseId' });
    AttendanceInstance.hasMany(models.Attendance, { foreignKey: 'instanceId' });
  };

  return AttendanceInstance;
};
