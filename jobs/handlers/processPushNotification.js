const logger = require("../../config/logger");
const models = require("../../config/models");
const firebaseService = require("../../services/firebaseService");

async function sendPushNotificationToUsers(message) {
  try {
    const tokens = await models.FcmToken.findAll({
      attributes: ["token"],
      raw: true,
    });

    if (!tokens) {
      logger.warn("No FCMTokens found");
    }

    const fcmTokens = tokens.map((t) => t.token);

    const sentNotifications = await firebaseService.pushNotificationToUsers(
      message,
      fcmTokens,
    );
    logger.info("Sent push Notifications", sentNotifications);
  } catch (error) {
     logger.error({
      error: error.message,
      stack: error.stack,
      statusCode: statusCode,
    });
  }
}

module.exports = { sendPushNotificationToUsers };
