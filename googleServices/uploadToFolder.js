const { authorize } = require("../config/google");
const { google } = require("googleapis");
const fs = require("node:fs");

async function uploadToFolder(folderId, fileObj) {
  const client = await authorize();

  const service = google.drive({ version: "v3", auth: client });

  const fileMetadata = {
    name: fileObj?.originalname || fileObj?.filename || "upload",
    parents: [folderId],
  };

  if (!fileObj || !fileObj?.path) {
    throw new Error(
      "uploadToFolder requires a disk-backed file with a 'path' property. Configure multer with diskStorage."
    );
  }

  if (typeof fs.createReadStream !== "function") {
    throw new TypeError("fs.createReadStream is not available in this environment");
  }

  const bodyStream = fs.createReadStream(fileObj?.path);

  const media = {
    mimeType: fileObj?.mimetype || "application/octet-stream",
    body: bodyStream,
  };

  try {
    const driveFile = await service.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id,name",
    });
    console.log(`${driveFile.data.name}, ${driveFile.data.id}`);
    return driveFile.data;
  } catch (err) {
    console.error("Error uploading file to Google Drive:", err);
    throw err;
  } finally {
    if (fileObj && fileObj.path) {
      fs.unlink(fileObj.path, (unlinkErr) => {
        if (unlinkErr) console.error(`Error cleaning up temp file ${fileObj.path}:`, unlinkErr);
      });
    }
  }
}

module.exports = uploadToFolder;
