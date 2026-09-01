const { Queue } = require("bullmq");
const { client } = require("../config/redis");

let generalQueue = null;

async function getQueue() {
  // ensure Redis client is connected before creating the Queue
  if (!generalQueue) {
    generalQueue = new Queue("queueProcessing", {
      connection: client,
    });
  }
  return generalQueue;
}

module.exports = { getQueue };
