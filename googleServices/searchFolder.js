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
  let pageToken = null;

  try {
    do {
      const res = await service.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        spaces: "drive",
        pageToken: pageToken, // Pass the token for the next page
        pageSize: 1000, // Maximize results per call to reduce API overhead
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      const files = res.data.files;
      if (files && files.length > 0) {
        allFiles.push(...files);

        // Recursively search subfolders found in this page
        for (const file of files) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            await listFilesInFolder(service, file.id, allFiles);
          }
        }
      }

      // Update token for the next iteration of the loop
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.error(`Error processing folder ${folderId}:`, err);
    throw err;
  }
}

module.exports = searchFilesInFolder;
