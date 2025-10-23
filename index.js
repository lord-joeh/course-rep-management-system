const { createServer } = require("http");
const { initSocketIO } = require("./middleware/socketIO");
const app = require("./app");
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;
const sequelize = require("./config/db");
const { authorize } = require("./config/google");
const { connectRedis } = require("./config/redis");
initSocketIO(httpServer);

httpServer.listen(PORT, (error) => {
  error
    ? console.error("Error starting up server: ", error.message)
    : console.log(`Server running on ${PORT}`);

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    throw err;
  });

  (async () => {
    try {
      await sequelize.authenticate();
      console.log("✅ Database connection has been established successfully.");

      await sequelize.sync({ alter: true });
      console.log("✅ Database Tables altered ");

      await authorize();
      console.log("✅ Google Drive Connected successfully");

      await connectRedis();
    } catch (err) {
      console.error(err);
    }
  })();
});
