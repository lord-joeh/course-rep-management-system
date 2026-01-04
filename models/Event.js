const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Event = sequelize.define(
    "Event",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      description: DataTypes.STRING,
      date: DataTypes.DATE,
      time: DataTypes.STRING,
      venue: DataTypes.STRING,
    },
    {
      tableName: "event",
      timestamps: true,
    }
  );
  return Event;
};
