const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Assignment = sequelize.define(
    "Assignment",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      title: DataTypes.STRING,
      description: DataTypes.STRING,
      courseId: DataTypes.STRING,
      deadline: DataTypes.DATE,
      submissionFolderID: DataTypes.STRING,
      fileId: DataTypes.STRING,
      fileName: DataTypes.STRING,
    },
    {
      tableName: "assignment",
      timestamps: true,
    }
  );
  Assignment.associate = (models) => {
    Assignment.belongsTo(models.Course, { foreignKey: "courseId" });
    Assignment.hasMany(models.AssignmentSubmission, { foreignKey: "assignmentId", as: "submissions" });
  };
  return Assignment;
};
