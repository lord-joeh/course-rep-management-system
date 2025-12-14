const deleteFile = require("../../googleServices/deleteFile");

async function deleteFiles(job) {
  const { fileIds } = job.data;

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    console.log("No files to delete");
    return;
  }

  const results = await Promise.allSettled(
    fileIds.map(async (fileId) => {
      try {
        await deleteFile(fileId);
        return fileId;
      } catch (error) {
        console.error(`Failed to delete file ${fileId}:`, error);
        throw error;
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`Failed to delete ${failed.length} files.`);
  }

  return {
    deletedCount: results.length - failed.length,
    failedCount: failed.length,
  };
}

module.exports = { deleteFiles };
