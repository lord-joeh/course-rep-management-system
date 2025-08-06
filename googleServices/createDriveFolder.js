const { authorize } = require("../config/google");
const { google } = require("googleapis");

async function createFolder(folderName) {
  let client = await authorize();

  const service = google.drive({ version: "v3", auth: client });
  const fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  try {
    const file = await service.files.create({
      requestBody: fileMetadata,
      fields: "id,name",
    });
    console.log("Folder Id:", file.data.id);
    return file.data.id;
  } catch (err) {
    console.log(err);
    throw new Error(err)
  }
}

module.exports = createFolder;
