const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Slides = sequelize.define(
    "Slides",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      driveFileID: { type: DataTypes.STRING, primaryKey: true },
      courseId: DataTypes.STRING
    },
    {
      tableName: "slides",
      timestamps: true,
    }
  );

  Slides.associate = (models) => {
    Slides.belongsTo(models.Course, { foreignKey: "courseId" });
  };
  return Slides;
};
