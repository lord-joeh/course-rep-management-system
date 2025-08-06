const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('GoogleToken', {
    userId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    client_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    client_secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'google_tokens',
    timestamps: true,
  });
};
