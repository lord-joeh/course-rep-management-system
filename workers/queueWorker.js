const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Worker } = require("bullmq");
const { redisConfig } = require("../config/redis");
const processQueue = require("../jobs/queueProcesser");
const { emitWorkerEvent } = require("../utils/emitWorkerEvent");
const logger = require("../config/logger");

async function initializeWorker() {
  try {
    const generalWorker = new Worker("queueProcessing", processQueue, {
      connection: redisConfig,
      concurrency: 5,
    });

    generalWorker.on("completed", (job) =>
      console.log(`Job ${job.id} completed`)
    );

    generalWorker.on("failed", (job, err) =>
      console.error(`Job ${job.id} failed:`, err)
    );

    console.log("Queue processing worker started.");

    await emitWorkerEvent("workerStarted", {
      message: "Queue processing worker started.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to initialize queue worker:", error.message);
  }
}

initializeWorker().catch((error) => {
  logger.error({
    error: error.message,
    stack: error.stack,
    statusCode: statusCode,
  });
});
