const Redis = require("ioredis");
require("dotenv").config();

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
};

const client = new Redis(redisConfig);

client.on("error", (err) => console.error("Redis Error:", err));
client.on("connect", () => console.log("Redis connected"));

async function connectRedis() {
  if (client.status === "wait") {
    await client.connect();
  }
  return client;
}

module.exports = { client, connectRedis, redisConfig };
