require("dotenv").config();
const { Worker } = require("bullmq");
const { redisConfig } = require("../config/redis");
const processQueue = require("../jobs/queueProcessor");
const { emitWorkerEvent } = require("../utils/emitWorkerEvent");
const logger = require("../config/logger");

async function initializeWorker() {
  try {
    const generalWorker = new Worker("queueProcessing", processQueue, {
      connection: redisConfig,
      concurrency: 5,
    });

    generalWorker.on("completed", (job) => {
      logger.info(`Job Name: ${job?.name} Job ID: ${job?.id} (completed)`);
    });

    generalWorker.on("failed", (job, err) => {
      logger.error({
        error: err.message,
        stack: err.stack,
        statusCode: err.statusCode,
      });
    });

    console.log("Queue processing worker started.");

    await emitWorkerEvent("workerStarted", {
      message: "Queue processing worker started.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to initialize queue worker:", error.message);
    logger.error({
      error: error.message,
      stack: error.stack,
      statusCode: statusCode,
    });
  }
}

initializeWorker().catch((error) => {
  console.error(error);
});
