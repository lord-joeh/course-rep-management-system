const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Assignment = sequelize.define('Assignment', {
    id: { type: DataTypes.STRING, primaryKey: true },
    title: DataTypes.STRING,
    description: DataTypes.STRING,
    courseId: DataTypes.STRING,
    deadline: DataTypes.DATE,
    driveFolderID: DataTypes.STRING
  }, {
    tableName: 'assignment',
    timestamps: true,
  });
  Assignment.associate = (models) => {
    Assignment.belongsTo(models.Course, { foreignKey: 'courseId' });
  };
  return Assignment;
};
