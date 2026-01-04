const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const NotificationRead = sequelize.define(
    "NotificationRead",
    {
      id: {
        type: DataTypes.STRING,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      isRead: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "notification_reads",
      timestamps: true,
    }
  );
  return NotificationRead;
};
