const { authorize } = require("../config/google");
const { google } = require("googleapis");
const createFolder = require("./createDriveFolder");

async function getCourseAssignmentsFolder(courseName) {
  const client = await authorize();
  const service = google.drive({ version: "v3", auth: client });
  const folderName = `Assignments - ${courseName}`;

  try {
    // Search for existing course-specific assignments folder in root
    const res = await service.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (res.data.files && res.data.files.length > 0) {
      console.log(`${folderName} folder found:`, res.data.files[0].id);
      return res.data.files[0];
    } else {
      // Create new course-specific assignments folder
      console.log(`${folderName} folder not found, creating new one.`);
      const newFolder = await createFolder(folderName);
      return newFolder;
    }
  } catch (err) {
    console.error(`Error getting or creating ${folderName} folder:`, err);
    throw err;
  }
}

module.exports = getCourseAssignmentsFolder;
