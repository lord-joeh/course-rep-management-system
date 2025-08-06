require("dotenv").config();
const { google } = require("googleapis");
const { models } = require("../config/db");
const { revokeGoogleAccess } = require("../googleServices/revokeGoogleAccess");

const SCOPES = process.env.SCOPES;
const userId = "admin-rep";

exports.googleAuth = async (req, res) => {
  try {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.client_id,
      process.env.client_secret,
      process.env.GOOGLE_REDIRECT_URI
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });

    res.redirect(authUrl);
  } catch (error) {
    console.error(error);
  }
};

exports.googleCallback = async (req, res) => {
  try {
    const code = req.query.code;
    const oAuth2Client = new google.auth.OAuth2(
      process.env.client_id,
      process.env.client_secret,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    await models.GoogleToken.upsert({
      userId,
      type: "authorized_user",
      client_id: process.env.client_id,
      client_secret: process.env.client_secret,
      refresh_token: tokens.refresh_token,
    });

    res.send("✅ Google account connected. You can now close this tab.");
  } catch (error) {
    console.error(error);
  }
};

exports.revokeGoogleAccess = async (req, res) => {
  try {
    await revokeGoogleAccess();
    res.status(200).json({ message: "Google account disconnected." });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke access." });
  }
};
