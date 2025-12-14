const { Queue } = require("bullmq");
const { redisConfig } = require("../config/redis");

let generalQueue = null;

async function getQueue() {
  if (!generalQueue) {
    console.log("Queue: Creating queue...");

    generalQueue = new Queue("queueProcessing", {
      connection: redisConfig,
    });
    console.log("Queue: Queue created successfully");
  }
  return generalQueue;
}

module.exports = { getQueue };
