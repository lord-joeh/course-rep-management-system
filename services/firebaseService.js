const admin = require("../config/firebase");
const logger = require("../config/logger");

class firebaseService {
  static buildMessageData(message) {
    return {
      notification: {
        title: message?.title,
        body: message?.body,
      },
      data: {
        title: message?.title,
        body: message?.body,
      },
      webpush: {
        notification: {
          title: message?.title,
          body: message?.body,
          icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS80xmNVFjYoCoYnfOgqjMtVV6S8kCqK-SruA&s",
        },
        fcm_options: {
          link: "/",
        },
      },
    };
  }

  static async pushNotificationToUser(message, fcmtoken) {
    try {
      const messageData = this.buildMessageData(message);
      const messageResponse = await admin
        ?.messaging()
        .send({ ...messageData, token: fcmtoken });
      logger.info(messageResponse);
      return messageResponse;
    } catch (error) {
       logger.error({
            error: error.message,
            stack: error.stack,
            statusCode: statusCode,
          });
      throw new Error(error);
    }
  }

  static async pushNotificationToUsers(message, fcmtokens) {
    try {
      const messageData = this.buildMessageData(message);
      const messageResponse = await admin
        ?.messaging()
        .sendEachForMulticast({ ...messageData, tokens: fcmtokens });

      if (messageResponse?.failureCount > 0) {
        const failedTokens = [];
        messageResponse.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(fcmtokens[idx]);
          }
        });
        logger.warn("Tokens that caused failures: " + failedTokens);
      }

      return messageResponse;
    } catch (error) {
       logger.error({
            error: error.message,
            stack: error.stack,
            statusCode: statusCode,
          });
      throw new Error(error);
    }
  }
}

module.exports = firebaseService;
