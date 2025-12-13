const { downloadFile } = require("../../googleServices/downloadFile");
const { getEmitter } = require("../../middleware/socketIO");
const models = require("../../config/models");
const fs = require("fs");
const crypto = require("crypto");

async function processSlides(job) {
  const { slideId, driveFileID, courseId, socketId } = job.data;
  const emitter = getEmitter();

  try {
    console.log(`Processing slide ${slideId} (Drive ID: ${driveFileID})`);

    // Download file from Drive
    const filePath = await downloadFile(driveFileID);

    // Calculate hash
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    const hex = hashSum.digest("hex");

    // Check for duplicates
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

      // Clean up local file
      fs.unlinkSync(filePath);

      // Enqueue job to delete the file from Drive
      const { enqueue } = require("../../services/enqueue");
      await enqueue("deleteFiles", {
        files: [{ id: driveFileID, name: models.Slides.name }], // name might not be available if we deleted model, better pass what we have
      });
      // Actually deleteFiles handler expects { files: [{id, name?}] }.

      if (socketId) {
        emitter.emit("jobFailed", {
          type: "processSlides",
          error: "Duplicate slide detected. The file has been removed.",
          socketId,
        });
      }
      return; // Stop processing
    }

    // Update slide with hash
    await models.Slides.update({ hash: hex }, { where: { id: slideId } });

    console.log(`Slide ${slideId} processed successfully`);

    // Clean up local file
    fs.unlinkSync(filePath);

    if (socketId) {
      const slide = await models.Slides.findByPk(slideId);
      emitter.emit("jobCompleted", {
        type: "processSlides",
        slideId,
        fileName: slide?.fileName,
        socketId,
      });
    }

    return true;
  } catch (error) {
    console.error(`Error processing slide ${slideId}:`, error);
    if (socketId) {
      emitter.emit("jobFailed", {
        type: "processSlides",
        error: error.message,
        socketId,
      });
    }
    throw error;
  }
}

module.exports = { processSlides };
