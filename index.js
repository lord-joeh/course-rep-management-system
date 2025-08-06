const app = require("./app");
const PORT = process.env.PORT || 4000;

const { sequelize } = require("./config/db");
const { authorize } = require("./config/google");
const createFolder = require("./googleServices/createDriveFolder");

const deleteFile = require("./googleServices/deleteFile");
app.listen(PORT, (error) => {
  error
    ? console.error("Error starting up server: ", error.message)
    : console.log(`Server running on ${PORT}`);

  // Global error handlers
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection:", reason);
  });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log("Database connection has been established successfully.");

      await sequelize.sync({ alter: true });
      console.log("Database Tables altered ");

      await authorize();
      console.log("Google Drive Connected successfully");

      // createFolder("Test Folder");
    } catch (err) {
      console.error(err);
    }
  })();
});
