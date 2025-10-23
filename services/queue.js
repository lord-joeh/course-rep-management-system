const { Queue } = require("bullmq");
const { connectRedis } = require("../config/redis");

const generalQueue = new Queue("queueProcessing", {
  connection: connectRedis(),
});

module.exports = { generalQueue };
