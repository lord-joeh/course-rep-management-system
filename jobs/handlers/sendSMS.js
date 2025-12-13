const sendSMS = require("../../utils/sendSMS");

async function processSMS(job) {
  const { to, message } = job.data;
  try {
    const result = await sendSMS(to, message);
    if (result && result.code === "ok") {
        return { sent: true, to };
    } else {
        throw new Error("SMS provider returned non-ok status");
    }
  } catch (error) {
    console.error(`Failed to send SMS to ${to}:`, error);
    throw error;
  }
}

module.exports = { processSMS };
