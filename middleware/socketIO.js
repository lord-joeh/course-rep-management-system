const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { Emitter } = require("@socket.io/redis-emitter");
const { connectRedis } = require("../config/redis");
const {
  removeSocketMapping,
  userSocketMap,
  socketUserMap,
} = require("./socketTracker");
let io;
let emitter;
const jwt = require("jsonwebtoken");

async function initSocketIO(httpServer) {
  console.log("🚀 Initializing Socket.IO...");

  // mirror express CORS settings so polling transport is allowed from the frontend
  io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  console.log("✅ Socket.IO server created");

  try {
    const pubClient = await connectRedis();
    const subClient = pubClient.duplicate();
    await subClient.connect();

    console.log("✅ Redis clients connected");

    io.adapter(createAdapter(pubClient, subClient));
    emitter = new Emitter(pubClient);
    console.log("✅ Socket.IO Redis adapter enabled");

    // Subscribe to worker events from Redis
    await subClient.subscribe("worker-events", (message, channel) => {
      console.log(`📨 Received message on channel: ${channel}`);
      if (channel === "worker-events") {
        try {
          const eventData = JSON.parse(message);
          console.log("📨 Received worker event:", eventData);

          // Emit the event to all connected Socket.IO clients
          io.emit(eventData.type, eventData);
          console.log(
            `📤 Worker event ${eventData.type} emitted to all clients`
          );
        } catch (error) {
          console.error("❌ Error processing worker event:", error);
        }
      }
    });
    console.log("✅ Subscribed to worker-events channel");

    subClient.on("error", (error) => {
      console.error("❌ Redis subscriber error:", error);
    });
  } catch (error) {
    console.error(
      "❌ Failed to setup Redis adapter for Socket.IO:",
      error.message
    );
    console.log("⚠️  Socket.IO running without Redis adapter");
    emitter = null;
  }

  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.id}`);

      const token = socket.handshake?.auth?.token;
      if (token) {
          try {
              const payload = jwt.verify(token, process.env.JWT_SECRET);
              const userId = payload.sub || payload.id;
              if (userId) {
                  userSocketMap.set(userId, socket.id);
                  socketUserMap.set(socket.id, userId);

                  console.log(`Socket ${socket.id} authenticated as user ${userId}`);
              }
          } catch (err) {
              console.log(`Socket auth failed: ${err.message}`);
              socket.emit("unauthorized", "Invalid token");
              socket.disconnect(true);
              return;
          }
      }

    // Handle socket disconnect inside the connection handler
    socket.on("disconnect", (reason) => {
      console.log(`User disconnected: ${socket.id} (reason: ${reason})`);
      // Clean up socket mappings when user disconnects
      removeSocketMapping(socket.id);
    });
  });
}

function getSocketIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
}

function getEmitter() {
  if (!emitter) {
    console.log("⚠️  Redis emitter not available, returning mock emitter");
    return {
      emit: (event, data) => {
        console.log(`Mock emitter: ${event}`, data);
        // Try to emit via Socket.IO directly if available
        if (io) {
          io.emit(event, data);
        }
      },
    };
  }
  return emitter;
}

module.exports = { initSocketIO, getSocketIO, getEmitter };
