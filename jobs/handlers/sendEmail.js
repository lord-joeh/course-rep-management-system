const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const customEmails = require("../../services/customEmails");

async function sendEmail(job) {
  const { socketId, userId, jobType, to } = job.data;

  try {
    // Emit job started event
    if (socketId || userId) {
      await emitWorkerEvent("jobStarted", {
        jobType: "sendEmail",
        socketId,
        userId,
        to,
      });
    }

    switch (jobType) {
      case "sendRegistrationSuccessMail":
        await customEmails.sendRegistrationSuccessMail(
          job?.data?.name,
          to,
          job?.data?.id
        );
        break;
      case "sendResetConfirmation":
        await customEmails.sendResetConfirmation(
        to,
        job?.data?.name,
        );
        break;
      case "sendGroupAssignmentEmail":
        await customEmails.sendGroupAssignmentEmail(
          job?.data?.groupName,
          job?.data?.group,
          job?.data?.courseId
        );
        break;
      case "sendResetLink":
        await customEmails.sendResetLink(
            job?.data?.email,
            job?.data?.reset_token
        )
            break;
      case "sendFeedbackReceived":
        await customEmails.sendFeedbackReceived(
            job?.data?.is_anonymous,
            job?.data?.id
        )
            break;
      case "sendMessageToStudent":
        await customEmails.sendMessageToStudent(
            job?.data?.email,
            job?.data?.message
        )
        break;
      default:
        break;
    }

    // Emit success event
    if (socketId || userId) {
      await emitWorkerEvent("emailSent", {
        jobType: "sendEmail",
        success: true,
        socketId,
        userId,
        to,
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
        socketId,
        userId,
        to,
      });
    }

    throw error;
  }
}

module.exports = { sendEmail };
