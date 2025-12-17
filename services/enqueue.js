const { getQueue } = require("../config/queue");

async function enqueue(type, payload = {}, opts = {}) {
  const queue = await getQueue();
  const data = { type, ...payload };
  const defaultOpts = {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 },
  };

  return await queue.add(type, data, {...defaultOpts, ...opts});
}

module.exports = { enqueue };
