const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Assignment = sequelize.define('Assignment', {
    id: { type: DataTypes.STRING, primaryKey: true },
    title: DataTypes.STRING,
    description: DataTypes.STRING,
    courseId: DataTypes.STRING,
    deadline: DataTypes.DATE,
  }, {
    tableName: 'assignment',
    timestamps: false,
  });
  Assignment.associate = (models) => {
    Assignment.belongsTo(models.Course, { foreignKey: 'courseId' });
  };
  return Assignment;
};
