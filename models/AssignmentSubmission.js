const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AssignmentSubmission = sequelize.define(
    "AssignmentSubmission",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      assignmentId: DataTypes.STRING,
      studentId: DataTypes.STRING,
      fileId: DataTypes.STRING,
      fileName: DataTypes.STRING,
      submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "assignment_submission",
      timestamps: true,
    }
  );
  AssignmentSubmission.associate = (models) => {
    AssignmentSubmission.belongsTo(models.Assignment, {
      foreignKey: "assignmentId",
    });
    AssignmentSubmission.belongsTo(models.Student, { foreignKey: "studentId" });
  };
  return AssignmentSubmission;
};
