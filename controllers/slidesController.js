const models = require("../config/models");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const uploadToFolder = require("../googleServices/uploadToFolder");
const { generatedId } = require("../services/customServices");
const searchFilesInFolder = require("../googleServices/searchFolder");
const deleteFile = require("../googleServices/deleteFile");

exports.uploadSlide = async (req, res) => {
  const { folderId, courseId } = req.query;
  const files = req.files;

  try {
    if (!files || files.length === 0) {
      return handleError(res, 400, "No slide uploaded");
    }

    if (files.length > 10) {
      return handleError(
        res,
        400,
        "Can not upload more than 10 slides at a time"
      );
    }

    if (!folderId) {
      return handleError(res, 400, "No folder ID provided for slide upload");
    }

    const uploadPromises = files.map(async (file) => {
      const uploadRes = await uploadToFolder(folderId, file);

      const slide = await models.Slides.create({
        id: await generatedId("SLD"),
        driveFileID: uploadRes.id,
        courseId: courseId,
      });

      return { uploadRes, slide };
    });

    const uploadResponses = await Promise.allSettled(uploadPromises);

    const successfulUploads = uploadResponses
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    const failedUploads = uploadResponses
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);

    if (successfulUploads.length === 0) {
      return handleError(
        res,
        400,
        "Failed to upload any slides",
        failedUploads
      );
    }

    const message =
      failedUploads.length > 0
        ? `Successfully uploaded ${successfulUploads.length} slides. Failed to upload ${failedUploads.length} slides.`
        : "All slides uploaded successfully.";

    return handleResponse(res, 201, message, {
      successfulUploads,
      failedUploads,
    });
  } catch (error) {
    console.error("Error in uploadSlide controller:", error);
    return handleError(res, 500, "Error uploading slides", error);
  }
};

exports.filesInSlideFolder = async (req, res) => {
  const { folderId } = req.query;
  try {
    if (!folderId) return handleError(res, 400, "No folder ID provided");

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
    return handleError(res, 500, "Error retrieving slides", error);
  }
};

exports.deleteSlide = async (req, res) => {
  const { slideId } = req.params;

  try {
    if (!slideId) {
      return handleError(res, 400, "No slide ID provided");
    }

    const slideToDelete = await models.Slides.findOne({
      where: { driveFileID: slideId },
    });

    if (!slideToDelete) {
      return handleError(res, 404, "Slide not found in the database");
    }

    await deleteFile(slideToDelete.driveFileID);

    const deletedCount = await models.Slides.destroy({
      where: { driveFileID: slideId },
    });

    if (deletedCount === 0) {
      return handleError(
        res,
        500,
        "Failed to delete slide from database after successful Drive deletion"
      );
    }

    return handleResponse(
      res,
      200,
      "Slide and database record deleted successfully"
    );
  } catch (error) {
    console.error("Error deleting slide:", error);
    if (error.message.includes("Google Drive API error")) {
      return handleError(
        res,
        500,
        "Failed to delete file from Google Drive",
        error
      );
    }

    return handleError(res, 500, "Error deleting slide", error);
  }
};
