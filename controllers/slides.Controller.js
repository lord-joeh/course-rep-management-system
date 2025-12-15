const models = require("../config/models");
const { handleError } = require("../services/errorService");
const { handleResponse } = require("../services/responseService");
const searchFilesInFolder = require("../googleServices/searchFolder");
const { enqueue } = require("../services/enqueue");

exports.uploadSlide = async (req, res) => {
  console.log("Received uploadSlide request");
  const { folderId, courseId } = req.body;
  const socketId = req.body.socketId || req.headers["x-socket-id"] || null;
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

    // Enqueue the upload job
    await enqueue(
      "uploadSlides",
      {
        files,
        folderId,
        courseId,
        socketId,
      },
      { removeOnComplete: { age: 3600 } }
    );

    return handleResponse(res, 202, "Slides upload started in background", {
      count: files.length,
    });
  } catch (error) {
    console.error("Error in uploadSlide controller:", error);
    if (error.message == "Unsupported file type") {
      return handleError(res, 400, "Unsupported file type", error);
    }
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

    const slideToDelete = await models.Slides.findByPk(slideId);

    if (!slideToDelete) {
      return handleError(res, 404, "Slide not found in the database");
    }

    const deletedCount = await slideToDelete.destroy();

    if (deletedCount === 0) {
      return handleError(
        res,
        500,
        "Failed to delete slide from database after successful Drive deletion"
      );
    }

    await enqueue("deleteFiles", { fileIds: [slideToDelete.driveFileID] });

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

exports.getSlidesByCourse = async (req, res) => {
  const { courseId, limit, page } = req.query;
  const _limit = parseInt(limit) || 10;
  const _page = parseInt(page) || 1;
  const offset = (_page - 1) * _limit;

  try {
    if (!courseId) {
      return handleError(res, 400, "No course ID provided");
    }

    const results = await models.Slides.findAndCountAll({
      where: { courseId: courseId },
      limit: _limit,
      offset: offset,
    });

    const { rows: slides, count: totalItems } = results;
    const totalPages = Math.ceil(totalItems / _limit);

    if (!slides || slides.length === 0) {
      return handleResponse(res, 200, "No slides found for this course", []);
    }

    return handleResponse(res, 200, "Slides retrieved successfully", {
      slides: slides,
      pagination: {
        totalItems,
        currentPage: _page,
        totalPages,
        itemsPerPage: _limit,
      },
    });
  } catch (error) {
    console.error("Error retrieving slides by course:", error);
    return handleError(res, 500, "Error retrieving slides", error);
  }
};
