const downloadFile = require("../../googleServices/downloadFile");
const { emitWorkerEvent } = require("../../utils/emitWorkerEvent");
const models = require("../../config/models");
const fs = require("fs");
const crypto = require("crypto");
const { enqueue } = require("../../services/enqueue");

async function processSlides(job) {
  const { slideId, driveFileID, courseId, socketId } = job.data;

  try {
    console.log(`Processing slide ${slideId} (Drive ID: ${driveFileID})`);

    // Emit job started event
    if (socketId) {
      await emitWorkerEvent("jobStarted", {
        jobType: "processSlides",
        slideId,
        socketId,
      });
    }

    // Download file from Drive
    if (socketId) {
      await emitWorkerEvent("jobProgress", {
        jobType: "processSlides",
        slideId,
        progress: 25,
        message: "Downloading file from Drive...",
        socketId,
      });
    }
    const fileResponse = await downloadFile(driveFileID);
    const fileStream = fileResponse.data;

    // Calculate hash using streams (Non-blocking)
    if (socketId) {
      await emitWorkerEvent("jobProgress", {
        jobType: "processSlides",
        slideId,
        progress: 50,
        message: "Calculating file hash...",
        socketId,
      });
    }
    const hashSum = crypto.createHash("sha256");

    await new Promise((resolve, reject) => {
      fileStream.on("error", (err) => reject(err));
      fileStream.on("data", (chunk) => hashSum.update(chunk));
      fileStream.on("end", () => resolve());
    });

    const hex = hashSum.digest("hex");

    // Check for duplicates
    if (socketId) {
      await emitWorkerEvent("jobProgress", {
        jobType: "processSlides",
        slideId,
        progress: 75,
        message: "Checking for duplicates...",
        socketId,
      });
    }
    const existingSlide = await models.Slides.findOne({
      where: {
        hash: hex,
        courseId: courseId,
      },
    });

    if (existingSlide && existingSlide.id !== slideId) {
      console.log(
        `Duplicate slide found: ${existingSlide.fileName} (Hash: ${hex})`
      );

      // Delete the newly created duplicate record from DB
      await models.Slides.destroy({ where: { id: slideId } });

      // Enqueue job to delete the file from Drive
      // FIX: Correct payload structure for deleteFiles handler
      await enqueue("deleteFiles", {
        fileIds: [driveFileID],
      });

      if (socketId) {
        await emitWorkerEvent("jobFailed", {
          jobType: "processSlides",
          error: "Duplicate slide detected. The file has been removed.",
          socketId,
        });
      }
      return; // Stop processing
    }

    // Update slide with hash
    await models.Slides.update({ hash: hex }, { where: { id: slideId } });

    console.log(`Slide ${slideId} processed successfully`);

    if (socketId) {
      const slide = await models.Slides.findByPk(slideId);
      await emitWorkerEvent("jobCompleted", {
        jobType: "processSlides",
        slideId,
        fileName: slide?.fileName,
        socketId,
      });
    }

    return true;
  } catch (error) {
    console.error(`Error processing slide ${slideId}:`, error);
    if (socketId) {
      await emitWorkerEvent("jobFailed", {
        jobType: "processSlides",
        error: error.message,
        socketId,
      });
    }
    throw error;
  }
}

module.exports = { processSlides };
