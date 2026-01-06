const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: DataTypes.STRING,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: DataTypes.STRING,
      message: DataTypes.TEXT,
    },
    {
      tableName: "notification",
      timestamps: true,
    }
  );
  Notification.associate = (models) => {
    Notification.belongsToMany(models.Student, {
      through: models.NotificationRead,
      as: "Readers",
      foreignKey: "notificationId",
    });
  };

  return Notification;
};
