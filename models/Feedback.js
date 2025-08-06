const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Feedback = sequelize.define('Feedback', {
    id: { type: DataTypes.STRING, primaryKey: true },
    studentId: DataTypes.STRING,
    content: DataTypes.STRING,
    is_anonymous: DataTypes.BOOLEAN,
  }, {
    tableName: 'feedback',
    timestamps: true,
  });
  
  Feedback.associate = (models) => {
    Feedback.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return Feedback;
};
