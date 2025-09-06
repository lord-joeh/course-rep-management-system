const { createClient } = require('redis');
require('dotenv').config();

const client = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: false,
    rejectUnauthorized: false,
  },
});

client.on('error', (err) => console.error('Redis Error:', err));

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
    console.log('✅ Redis Cloud connected successfully');
  }
}

module.exports = { client, connectRedis };  