const { createClient } = require("redis");
require("dotenv").config();

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    tls: false,
    rejectUnauthorized: false,
    connectTimeout: 5000,
    lazyConnect: true,
  },
});

client.on("error", (err) => console.error("Redis Error:", err));

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
    console.log("✅ Redis Cloud connected successfully");
  }
  return client;
}

module.exports = { client, connectRedis };
