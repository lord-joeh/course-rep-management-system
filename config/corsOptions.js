const whitelist = [process.env.FRONTEND_URL, process.env.NGINX_SERVER];
if (process.env.NODE_ENV !== "production") {
  whitelist.push("http://localhost:5173", "http://localhost:4173");
}

exports.corsOptions = {
  origin: (origin, callback) => {
    if (whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cache-Control",
    "pragma",
    "X-Socket-ID",
  ],
  exposedHeaders: ["Content-Disposition"],
};
