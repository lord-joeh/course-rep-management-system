// Store user ID to socket ID mappings
const userSocketMap = new Map();
const socketUserMap = new Map();

/**
 * Middleware to capture socket ID from request headers
 * This should be used after authentication middleware
 */
exports.captureSocketId = (req, res, next) => {
  const socketId = req.header("X-Socket-ID");

  if (socketId && req.student) {
    // Stores socket ID in request for potential "this tab" usage
    req.socketId = socketId;
    console.log(`Request from user ${req.student.id} with socket ${socketId}`);
  }

  next();
};

/**
 * Get socket ID for a specific user
 * @param {string} userId - The user ID
 * @returns {string|null} - The socket ID or null if not found
 */
exports.getSocketIdByUserId = (userId) => {
  return userSocketMap.get(userId) || null;
};

/**
 * Get user ID for a specific socket
 * @param {string} socketId - The socket ID
 * @returns {string|null} - The user ID or null if not found
 */
exports.getUserIdBySocketId = (socketId) => {
  return socketUserMap.get(socketId) || null;
};

/**
 * Remove socket mapping when user disconnects
 * @param {string} socketId - The socket ID to remove
 */
exports.removeSocketMapping = (socketId) => {
  const userId = socketUserMap.get(socketId);
  if (userId) {
    userSocketMap.delete(userId);
    socketUserMap.delete(socketId);
    console.log(`Removed socket mapping for user ${userId}`);
  }
};

/**
 * Emit message to a specific user by their user ID
 * @param {string} userId - The user ID
 * @param {string} event - The event name
 * @param {any} data - The data to send
 * @returns {boolean} - True if message was sent, false if user not connected
 */
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

/**
 * Emit message to multiple users
 * @param {string[]} userIds - Array of user IDs
 * @param {string} event - The event name
 * @param {any} data - The data to send
 * @returns {number} - Number of users the message was sent to
 */
exports.emitToUsers = (userIds, event, data) => {
  let sentCount = 0;

  userIds.forEach((userId) => {
    if (exports.emitToUser(userId, event, data)) {
      sentCount++;
    }
  });

  return sentCount;
};

/**
 * Get all connected user IDs
 * @returns {string[]} - Array of connected user IDs
 */
exports.getConnectedUsers = () => {
  return Array.from(userSocketMap.keys());
};

/**
 * Check if a user is connected
 * @param {string} userId - The user ID to check
 * @returns {boolean} - True if user is connected
 */
exports.isUserConnected = (userId) => {
  return userSocketMap.has(userId);
};

module.exports = {
  // Deprecated/No-op functions kept for API compatibility during refactor
  getSocketIdByUserId: () => null,
  getUserIdBySocketId: () => null,
  removeSocketMapping: () => {},
  getConnectedUsers: () => [],
  isUserConnected: () => false,

  // Active functions
  captureSocketId: exports.captureSocketId,
  emitToUser: exports.emitToUser,
  emitToUsers: exports.emitToUsers,

  // Empty maps for safety
  userSocketMap: new Map(),
  socketUserMap: new Map(),
};
