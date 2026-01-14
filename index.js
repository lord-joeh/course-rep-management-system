const { createServer } = require("node:http");
const { initSocketIO } = require("./middleware/socketIO");
const app = require("./app");
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
const sequelize = require("./config/db");
const { authorize } = require("./config/google");
const { connectRedis } = require("./config/redis");
const { regStudent } = require("./utils/fakerGenerator");
initSocketIO(httpServer);

httpServer.listen(PORT, (error) => {
  error
    ? console.error("Error starting up server: ", error.message)
    : console.log(`Server running on ${PORT}`);

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    process.exit(1);
  });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log("✅ Database connection has been established successfully.");

      await authorize();
      console.log("✅ Google Drive Connected successfully");

      await connectRedis();

      await regStudent(2);
    } catch (err) {
      console.error(err);
    }
  })();
});
