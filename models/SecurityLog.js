const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SecurityLog = sequelize.define('SecurityLog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    student_id: DataTypes.STRING,
    instance_id: DataTypes.STRING,
    event_type: DataTypes.STRING,
    details: DataTypes.STRING,
  }, {
    tableName: 'security_logs',
    timestamps: true,
  });
  return SecurityLog;
};
