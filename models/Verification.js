const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Verification = sequelize.define('Verification', {
    student_id: { type: DataTypes.STRING, primaryKey: true },
    reset_token: DataTypes.STRING,
    reset_token_expiration: DataTypes.DATE,
  }, {
    tableName: 'verification',
    timestamps: true,
  });
  
  Verification.associate = (models) => {
    Verification.belongsTo(models.Student, { foreignKey: 'student_id' });
  };

  return Verification;
};
