const { Queue } = require("bullmq");
const { connectRedis, client } = require("../config/redis");

let generalQueue = null;

async function getQueue() {
  // ensure Redis client is connected before creating the Queue
  await connectRedis();
  if (!generalQueue) {
    console.log("Queue: Creating queue...")
    generalQueue = new Queue("queueProcessing", {
      connection: client,
    });
  }
  console.log("Queue: Queue created successfully")
  return generalQueue;
}

module.exports = { getQueue };
