const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { Emitter } = require("@socket.io/redis-emitter");
const { redisConfig } = require("../config/redis");
const Redis = require("ioredis");

let io;
let emitter;
const jwt = require("jsonwebtoken");

async function initSocketIO(httpServer) {
  console.log("🚀 Initializing Socket.IO...");

  // mirror express CORS settings so polling transport is allowed from the frontend
  io = new Server(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: (origin, callback) => {
        const whitelist = [process.env.FRONTEND_URL];
        // Allow ngrok host if provided (useful when frontend is accessed through an ngrok+nginx proxy)
        if (process.env.NGROK_HOST) {
          whitelist.push(process.env.NGROK_HOST);
        }
        if (process.env.NODE_ENV !== "production") {
          whitelist.push("http://localhost:5173");
        }
        if (whitelist.indexOf(origin) !== -1 || !origin) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  console.log("✅ Socket.IO server created");

  try {
    const pubClient = new Redis(redisConfig);
    const subClient = new Redis(redisConfig);

    console.log("✅ Redis clients connected");

    io.adapter(createAdapter(pubClient, subClient));
    emitter = new Emitter(pubClient);
    console.log("✅ Socket.IO Redis adapter enabled");

    // Subscribe to worker events from Redis
    await subClient.subscribe("worker-events");
    console.log("✅ Subscribed to worker-events channel");

    // Listen for messages on the subscribed channel
    subClient.on("message", (channel, message) => {
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

  // Middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const userId = payload.sub || payload.id;
      if (!userId) {
        return next(new Error("Authentication error: Invalid token payload"));
      }
      socket.userId = userId;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.id} (User ID: ${socket.userId})`);

    // Join room named by userId for targeted messaging
    if (socket.userId) {
      socket.join(socket.userId);
      console.log(`Socket ${socket.id} joined room ${socket.userId}`);
    }

    // Handle socket disconnect inside the connection handler
    socket.on("disconnect", (reason) => {
      console.log(`User disconnected: ${socket.id} (reason: ${reason})`);
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
    // If IO is initialized (Main Server) but emitter is missing, it failed to load.
    if (io) {
      console.log("⚠️  Redis emitter not available, returning mock emitter");
      return {
        emit: (event, data) => {
          console.log(`Mock emitter: ${event}`, data);
          io.emit(event, data);
        },
      };
    }

    // If IO is NOT initialized, we are likely in a Worker process.
    // Initialize a standalone emitter.
    try {
      console.log("🔄 Initializing standalone Redis Emitter for Worker...");
      const redisClient = new Redis(redisConfig);
      emitter = new Emitter(redisClient);
      console.log("✅ Worker Emitter initialized");
      return emitter;
    } catch (err) {
      console.error("Failed to initialize worker emitter:", err);
      return {
        emit: (event, data) =>
          console.log(`[Mock Worker Emitter] ${event}`, data),
      };
    }
  }
  return emitter;
}

module.exports = { initSocketIO, getSocketIO, getEmitter };
