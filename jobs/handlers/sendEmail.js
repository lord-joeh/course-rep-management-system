const { sendNotification } = require("../../utils/sendEmail");
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");

async function sendEmail(job) {
  const { to, subject, html, socketId, userId } = job.data;

  try {
    // Emit job started event
    if (socketId || userId) {
      await emitWorkerEvent("jobStarted", {
        jobType: "sendEmail",
        to,
        socketId,
        userId,
      });
    }

    await sendNotification(to, subject, html);

    // Emit success event
    if (socketId || userId) {
      await emitWorkerEvent("emailSent", {
        jobType: "sendEmail",
        to,
        success: true,
        socketId,
        userId,
      });
    }

    return { sent: true, to };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);

    // Emit failure event
    if (socketId || userId) {
      await emitWorkerEvent("jobFailed", {
        jobType: "sendEmail",
        error: error.message,
        to,
        socketId,
        userId,
      });
    }

    throw error;
  }
}

module.exports = { sendEmail };
