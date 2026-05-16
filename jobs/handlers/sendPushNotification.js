const firebaseService = require("../../services/firebaseService");
const { sendPushNotificationToUsers } = require("./processPushNotification");

async function processPushNotification(job) {
  const { jobType, fcmtoken, message } = job.data;

  switch (jobType) {
    case "pushNotificationToUser":
      firebaseService.pushNotificationToUser(message, fcmtoken);
      break;
    case "pushNotificationToUsers":
      await sendPushNotificationToUsers(message);
      break;

    default:
      break;
  }
}

module.exports = processPushNotification;
