const { Worker } = require("bullmq");
const { redisConfig } = require("../config/redis");
const processQueue = require("../jobs/queueProcesser");
require("dotenv").config();
const { emitWorkerEvent } = require("../utils/emitWorkerEvent");

async function initializeWorker() {
  try {
    // BullMQ will create its OWN blocking connection using this config
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

initializeWorker().catch((err) => console.log(err));
