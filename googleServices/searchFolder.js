const { google } = require("googleapis");
const { authorize } = require("../config/google");

async function searchFilesInFolder(folderId) {
  const client = await authorize();
  const service = google.drive({ version: "v3", auth: client });
  const allFiles = [];

  try {
    await listFilesInFolder(service, folderId, allFiles);
    return allFiles;
  } catch (err) {
    console.error("Error in recursive search:", err);
    throw err;
  }
}

async function listFilesInFolder(service, folderId, allFiles) {
  try {
    console.log(`Making API call for folder: ${folderId}`);
    const res = await service.files.list({
      q: `'${folderId}' in parents`,
      fields: "nextPageToken, files(id, name, mimeType)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const files = res.data.files;
    console.log(`API call successful. Found ${files ? files.length : 0} items.`);

    if (!files || files.length === 0) {
      console.log(`No files or subfolders found in: %s`, folderId);
      return;
    }

    allFiles.push(...files);

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        console.log(`Found subfolder: ${file.name} (${file.id}). Recursing...`);
        await listFilesInFolder(service, file.id, allFiles);
      }
    }
  } catch (err) {
    console.error(`Error processing folder %s`, folderId, err);
    throw err;
  }
}

module.exports = searchFilesInFolder;