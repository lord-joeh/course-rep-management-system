const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Lecturer = sequelize.define('Lecturer', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
  }, {
    tableName: 'lecturer',
    timestamps: true,
  });
  Lecturer.associate = (models) => {
    Lecturer.hasMany(models.Course, { foreignKey: 'lecturerId' });
  };
  return Lecturer;
};
