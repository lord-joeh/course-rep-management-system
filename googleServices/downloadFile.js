const { google } = require("googleapis");
const { authorize } = require("../config/google");

async function downloadFile(fileId) {
  const client = await authorize();
  const service = google.drive({ version: "v3", auth: client });

  try {
    const metadataRes = await service.files.get({
      fileId: fileId,
      fields: "name, mimeType",
    });

    const fileName = metadataRes.data.name;
    const mimeType = metadataRes.data.mimeType;
    const fileContentRes = await service.files.get({
      fileId: fileId,
      alt: "media",
    }, {
      responseType: 'stream' 
    });

    return {
      data: fileContentRes.data, 
      headers: {
        'content-type': mimeType,
      },
      fileName: fileName
    };
  } catch (err) {
    console.error("Error during file download from Google Drive API:", err);
    throw err;
  }
}

module.exports = downloadFile;