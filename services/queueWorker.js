const { Worker } = require("bullmq");
const { connectRedis, client } = require("../config/redis");
const processQueue = require("../jobs/queueProcesser");
require("dotenv").config();

// Initialize Redis connection and worker
async function initializeWorker() {
  try {
    // Connect to Redis first
    await connectRedis();
    
    const generalWorker = new Worker("queueProcessing", processQueue, {
      connection: client,
      concurrency: 5,
    });

    generalWorker.on("completed", (job) => console.log(`Job ${job.id} completed`));

    generalWorker.on("failed", (job, err) =>
      console.error(`Job ${job.id} failed:`, err)
    );

    console.log("Queue processing worker started.");
    
    
    // Publish worker started event to Redis channel
    // The main server will subscribe to this channel and emit to Socket.IO clients
    try {
      const eventData = {
        type: "workerStarted",
        message: "Queue processing worker started.",
        timestamp: new Date().toISOString()
      };
      
      console.log("📤 Publishing worker event to Redis:", eventData);
      const result = await client.publish("worker-events", JSON.stringify(eventData));
      console.log(`📤 Worker started event published to Redis channel. Result: ${result}`);
      
      // Test Redis connection
      const pingResult = await client.ping();
      console.log(`📤 Redis ping result: ${pingResult}`);
      
    } catch (error) {
      console.error("❌ Failed to publish worker started event:", error.message);
    }
  } catch (error) {
    console.error("Failed to initialize queue worker:", error.message);
  }
}

// Initialize the worker
initializeWorker().catch(err => console.log(err));
