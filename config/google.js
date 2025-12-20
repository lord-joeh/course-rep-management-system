const { google } = require("googleapis");
const { models } = require("./db");
require("dotenv").config();
const userId = process.env.USER_ID;

async function authorize() {
  const token = await models.GoogleToken.findOne({ where: { userId } });
  if (!token) throw new Error("Google token not found. Please authorize first");

  const auth = new google.auth.OAuth2(
    token.client_id,
    token.client_secret,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    expiry_date: token.expiry_date,
  });

  if (auth.isTokenExpiring()) {
    const { credentials } = await auth.refreshAccessToken();
    await models.GoogleToken.update(
      {
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date,
      },
      { where: { userId } }
    );
    auth.setCredentials(credentials);
  }

  return auth;
}

module.exports = { authorize };
