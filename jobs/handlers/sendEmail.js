const { sendNotification } = require("../../utils/sendEmail");

async function sendEmail(job) {
  const { to, subject, html } = job.data;
  try {
    await sendNotification(to, subject, html);
    return { sent: true, to };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

module.exports = { sendEmail };
