const app = require("./app");
const PORT = process.env.PORT || 4000;

const { sequelize } = require("./config/db");

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
      await sequelize.sync({ alter: true});
      console.log("Tables has been created successfully!");
    } catch (err) {
      console.error("Unable to connect to the database:", err);
    }
  })();
});
