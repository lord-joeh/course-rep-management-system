exports.captureSocketId = (req, res, next) => {
  const socketId = req.header("X-Socket-ID");

  if (socketId) {
    req.socketId = socketId;
    if (req.student) {
      console.log(
        `Request from user ${req.student.id} with socket ${socketId}`
      );
    } else {
      console.log(`Request with socket ${socketId} (no student in request)`);
    }
  }

  next();
};

exports.emitToUser = (userId, event, data) => {
  try {
    // Require socketIO lazily to avoid circular dependency during module init
    const socketModule = require("./socketIO");
    const io =
      typeof socketModule.getSocketIO === "function"
        ? socketModule.getSocketIO()
        : null;
    if (!io) {
      console.error(
        `Socket.IO instance not available when sending to user ${userId}`
      );
      return false;
    }

    // Use Room-based emitting
    io.to(userId).emit(event, data);
    console.log(`Message sent to room ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error sending message to user ${userId}:`, error);
    return false;
  }
};

exports.emitToUsers = (userIds, event, data) => {
  let sentCount = 0;

  userIds.forEach((userId) => {
    if (exports.emitToUser(userId, event, data)) {
      sentCount++;
    }
  });

  return sentCount;
};

module.exports = {
  captureSocketId: exports.captureSocketId,
  emitToUser: exports.emitToUser,
  emitToUsers: exports.emitToUsers,
};
