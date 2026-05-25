const { enqueue } = require("../services/enqueue");

async function pushNotification(message) {
  if (!message) return;

  await enqueue("sendPushNotification", {
    jobType: "pushNotificationToUsers",
    message,
  });
}

module.exports = pushNotification