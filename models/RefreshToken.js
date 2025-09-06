const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RefreshToken = sequelize.define(
    "RefreshToken",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: { type: DataTypes.STRING, allowNull: false },
      token: { type: DataTypes.STRING, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: "refresh_tokens",
      timestamps: true,
    }
  );
  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.Student, { foreignKey: "student_id" });
  };
  return RefreshToken;
};
