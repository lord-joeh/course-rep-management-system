const { getEmitter } = require("../middleware/socketIO");

async function processQueue(job) {
  const { type, socketId } = job.data;
  const emitter = getEmitter();
  
}

module.exports = processQueue