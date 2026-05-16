const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FcmToken = sequelize.define(
    "FcmToken",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: { type: DataTypes.STRING, allowNull: false },
      token: { type: DataTypes.STRING, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: "fcm_tokens",
      timestamps: true,
    },
  );
  FcmToken.associate = (models) => {
    FcmToken.belongsTo(models.Student, { foreignKey: "student_id" });
  };
  return FcmToken;
};
