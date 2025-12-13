const { processSlides } = require("./handlers/processSlides");
const { sendEmail } = require("./handlers/sendEmail");
const { processSMS } = require("./handlers/sendSMS");
const { deleteFiles } = require("./handlers/deleteFiles");
const { uploadSlides, uploadAssignment } = require("./handlers/uploadHandlers");

async function processQueue(job) {
  const { type } = job.data;
  console.log("ProcessQueue: Processing job:", job);

  try {
    switch (type) {
      case "processSlides":
        return await processSlides(job);
      case "sendEmail":
        return await sendEmail(job);
      case "sendSMS":
        return await processSMS(job);
      case "deleteFiles":
        return await deleteFiles(job);
      case "uploadSlides":
        return await uploadSlides(job);
      case "uploadAssignment":
        return await uploadAssignment(job);
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (err) {
    console.error("❌ Job processing error:", err);
    throw err;
  }
}

module.exports = processQueue;
