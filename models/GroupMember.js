const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const GroupMember = sequelize.define(
    "GroupMember",
    {
      groupId: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      studentId: { type: DataTypes.STRING, primaryKey: true },
      isLeader: DataTypes.BOOLEAN,
    },
    {
      tableName: "group_member",
      timestamps: true,
    }
  );

  GroupMember.associate = (models) => {
    GroupMember.belongsTo(models.Group, { foreignKey: "groupId" });
    GroupMember.belongsTo(models.Student, { foreignKey: "studentId" });
  };

  return GroupMember;
};
