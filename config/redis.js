const Redis = require("ioredis");
const logger = require("./logger");
require("dotenv").config();

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASS || "",
  tls: {},
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 5) {
      logger.error("Redis max retries reached");
      return null;
    }
    return Math.min(times * 500, 3000);
  },
};

const client = new Redis(redisConfig);

client.on("error", (err) =>
  logger.error("Redis Error", { message: err.message, code: err.code }),
);
client.on("connect", () => logger.info("Redis connected"));
client.on("reconnecting", () => logger.warn("Redis reconnecting..."));
client.on("ready", () => logger.info("Redis ready"));

async function connectRedis() {
  await client.connect();
  return client;
}

module.exports = { client, connectRedis, redisConfig };
