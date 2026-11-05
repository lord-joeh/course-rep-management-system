// routes/health.Route.js
const express = require("express");
const healthRoute = express.Router();
const sequelize = require("../config/db");
const { client } = require("../config/redis");

healthRoute.get("/health", async (req, res) => {
  try {
    // 1. Check Database
    await sequelize.authenticate();

    // 2. Check Redis Cache
    await client.ping();

    res.status(200).json({
      status: "UP",
      timestamp: new Date().toISOString(),
      services: { database: "UP", redis: "UP" },
    });
  } catch (error) {
    res.status(503).json({
      status: "DOWN",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

module.exports = healthRoute;
