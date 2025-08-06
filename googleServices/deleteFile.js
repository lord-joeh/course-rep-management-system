const { authorize } = require("../config/google");
const { google } = require("googleapis");

async function deleteFile(fileId) {
  try {
    const client = await authorize();

    const service = google.drive({ version: "v3", auth: client });
    const response = await service.files.delete({
      fileId: fileId,
    });
    console.log(response?.statusText);
    return response.data;
  } catch (error) {
    console.error(error);
    throw new Error(error)
  }
}

module.exports = deleteFile;
