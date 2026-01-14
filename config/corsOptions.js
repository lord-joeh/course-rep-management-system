const whitelist = [
  process.env.FRONTEND_URL,
  process.env.NGINX_SERVER,
  process.env.OUTRAY_HOST,
];

if (process.env.NODE_ENV !== "production") {
  whitelist.push(
    "http://localhost:5173",
    "http://localhost:4173",
    "http://localhost:5000"
  );
}

exports.corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);

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
    "Pragma",
    "X-Socket-ID",
  ],
  exposedHeaders: ["Content-Disposition"],
};
