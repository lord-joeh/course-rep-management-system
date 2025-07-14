const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GroupMember = sequelize.define('GroupMember', {
    groupId: { type: DataTypes.STRING, primaryKey: true },
    studentId: { type: DataTypes.STRING, primaryKey: true },
    isLeader: DataTypes.BOOLEAN,
  }, {
    tableName: 'group_member',
    timestamps: false,
  });

  GroupMember.associate = (models) => {
    GroupMember.belongsTo(models.Group, { foreignKey: 'groupId' });
    GroupMember.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return GroupMember;
};
