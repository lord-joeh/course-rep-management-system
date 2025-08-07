require("dotenv").config();
const { google } = require("googleapis");
const  models  = require("../config/models");
const { revokeGoogleAccess } = require("../googleServices/revokeGoogleAccess");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const downloadFile = require("../googleServices/downloadFile");
const { searchFilesInFolder } = require("../googleServices/searchFolder");
const { createFolder } = require("../googleServices/createDriveFolder");
const { uploadToFolder } = require("../googleServices/uploadToFolder");
const { deleteFile } = require("../googleServices/deleteFile");

const SCOPES = process.env.SCOPES;
const userId = process.env.USER_ID;

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
    return handleError(res, 500, "Error connecting google account", error);
  }
};

exports.revokeGoogleAccess = async (req, res) => {
  try {
    await revokeGoogleAccess();

    return handleResponse(res, 200, "Google account disconnected");
  } catch (err) {
    return handleError(res, 500, "Failed to revoke google access", err);
  }
};

exports.downloadFile = async (req, res) => {
  const { fileId } = req.query;
  try {
    const fileResponse = await downloadFile(fileId);

    if (!fileResponse || !fileResponse.data) {
      return res
        .status(400)
        .send("Failed retrieving downloadable file content.");
    }

    const contentType = fileResponse.headers["content-type"];
    const fileName = fileResponse.fileName;

    res.set("Content-Type", contentType);
    res.set("Content-Disposition", `attachment; filename="${fileName}"`);
    fileResponse.data.pipe(res);

    fileResponse.data.on("end", () => {
      console.log("File stream ended successfully.");
    });

    fileResponse.data.on("error", (err) => {
      console.error("Error piping file stream:", err);

      if (!res.headersSent) {
        res.status(500).send("Error streaming file content.");
      }
    });
  } catch (error) {
    console.error("Error in downloadFile route handler:", error);
    if (!res.headersSent) {
      res.status(500).send("Error downloading file.");
    }
  }
}

exports.searchFile = async (req, res) => {
  try {
    const { folderId } = req.query;

    const searchResponse = await searchFilesInFolder(folderId);
    if (!searchResponse)
      return handleError(res, 400, "Failed retrieving files in folder");

    return handleResponse(
      res,
      200,
      "Files retrieved successfully",
      searchResponse
    );
  } catch (error) {
    return handleError(res, 500, "Error retrieving file", error);
  }
};

exports.createFolder = async (req, res) => {
  const { folderName } = req.body;

  try {
    const folderResponse = await createFolder(folderName);
    if (!folderResponse) return handleError(res, 400, "Failed creating folder");

    return handleResponse(
      res,
      200,
      "Folder created successfully",
      folderResponse
    );
  } catch (error) {
    return handleError(res, 500, "Error creating folder", error);
  }
};

exports.uploadToFolder = async (req, res) => {
  const { folderId } = req.query;
  const uploadedFile = req.file;

  try {
    const uploadResponse = await uploadToFolder(folderId, uploadedFile);
    if (!uploadResponse)
      return handleError(res, 400, "Failed uploading file to folder");

    return handleResponse(res, 200, "File upload successfully", uploadResponse);
  } catch (error) {
    return handleError(res, 500, "Error uploading file to folder ", error);
  }
};

exports.deleteFile = async (req, res) => {
  const { fileId } = req.params;

  try {
    const deleteResponse = await deleteFile(fileId);
    if (!deleteResponse) return handleError(res, 400, "Failed to delete file");

    return handleResponse(
      res,
      200,
      "File deleted successfully",
      deleteResponse
    );
  } catch (error) {
    return handleError(res, 500, "Error deleting file", error);
  }
};
