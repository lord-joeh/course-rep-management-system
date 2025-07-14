const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Student = sequelize.define('Student', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    status: {type: DataTypes.STRING, defaultValue: 'active'},
    password_hash: DataTypes.TEXT,
    isRep: { type: DataTypes.BOOLEAN, defaultValue: false}
  }, {
    tableName: 'student',
    timestamps: true,
  });

  Student.associate = (models) => {
    Student.belongsToMany(models.Course, {
      through: models.CourseStudent,
      foreignKey: 'studentId',
      otherKey: 'courseId',
    });
    Student.belongsToMany(models.Group, {
      through: models.GroupMember,
      foreignKey: 'studentId',
      otherKey: 'groupId',
    });
    Student.hasMany(models.Attendance, { foreignKey: 'studentId' });
    Student.hasMany(models.Feedback, { foreignKey: 'studentId' });
    Student.hasMany(models.GroupMember, { foreignKey: 'studentId' });
    Student.hasOne(models.Verification, { foreignKey: 'student_id' });
  };

  return Student;
};
