const sendSMS = require("../../utils/sendSMS");
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");

async function processSMS(job) {
  const { to, message, socketId, userId } = job.data;

  try {
    // Emit job started event
    if (socketId || userId) {
      await emitWorkerEvent("jobStarted", {
        jobType: "sendSMS",
        to,
        socketId,
        userId,
      });
    }


    const result = await sendSMS(to, message);
    if (result && result?.code === "ok") {
      // Emit success event
      if (socketId || userId) {
        await emitWorkerEvent("smsSent", {
          jobType: "sendSMS",
          to,
          success: true,
          socketId,
          userId,
        });
      }
      return { sent: true, to };
    } else {
     new Error("SMS provider returned non-ok status");
    }
  } catch (error) {
    console.error(`Failed to send SMS to ${to}:`, error);

    // Emit failure event
    if (socketId || userId) {
      await emitWorkerEvent("jobFailed", {
        jobType: "sendSMS",
        error: error.message,
        to,
        socketId,
        userId,
      });
    }

    throw error;
  }
}

module.exports = { processSMS };
