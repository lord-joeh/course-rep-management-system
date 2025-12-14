const { getQueue } = require("./queue");

async function enqueue(type, payload = {}, opts = {}) {
  const queue = await getQueue();
  console.log("Enqueue: Queue retrieved successfully");
  const data = { type, ...payload };
  const defaultOpts = {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 },
  };

  const job = await queue.add(type, data, { ...defaultOpts, ...opts });
  return job;
}

module.exports = { enqueue };
