const axios = require("axios");
const { models } = require("../config/db");

const userId = process.env.USER_ID;

async function revokeGoogleAccess() {
  try {
    const record = await models.GoogleToken.findOne({ where: { userId } });

    if (!record || !record?.refresh_token) {
      console.log("No token found to revoke.");
      return;
    }

    const token = record.refresh_token;

    await axios.post(
      "https://oauth2.googleapis.com/revoke",
      {},
      {
        params: {
          token,
        },
        headers: {
          "Content-type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log(" Token successfully revoked.");

    await models.GoogleToken.destroy({ where: { userId } });
    console.log(" Token removed from DB.");
  } catch (error) {
    console.error("Failed to revoke token:", error?.response?.data || error);
  }
}

module.exports = {
  revokeGoogleAccess,
};
