const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Group = sequelize.define(
    "Group",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: DataTypes.STRING,
      courseId: DataTypes.STRING,
      isGeneral: DataTypes.BOOLEAN,
      description: DataTypes.STRING,
    },
    {
      tableName: "groups",
      timestamps: true,
    }
  );

  Group.associate = (models) => {
    Group.belongsTo(models.Course, { foreignKey: "courseId" });
    Group.belongsToMany(models.Student, {
      through: models.GroupMember,
      foreignKey: "groupId",
      otherKey: "studentId",
    });
  };

  return Group;
};
