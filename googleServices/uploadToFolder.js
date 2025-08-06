const { authorize } = require("../config/google");
const { google } = require("googleapis");
const stream = require("stream");

async function uploadToFolder(folderId, file) {
  const bufferStream = new stream.PassThrough();
  bufferStream.end(file?.buffer);

  const client = await authorize();

  const service = google.drive({ version: "v3", auth: client });

  const fileMetadata = {
    name: file?.originalname,
    parents: [folderId],
  };

  const media = {
    mimeType: file?.mimetype,
    body: bufferStream,
  };

  try {
    const file = await service.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id,name",
    });
    console.log(`${file.data.name}, ${file.data.id}`);
    return file.data;
  } catch (err) {
    console.error(err);
    throw new Error(err)
  }
}

module.exports = uploadToFolder;
