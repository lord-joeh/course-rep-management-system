const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.STRING, primaryKey: true },
    title: DataTypes.STRING,
    message: DataTypes.STRING,
  }, {
    tableName: 'notification',
    timestamps: false,
  });
  return Notification;
};
