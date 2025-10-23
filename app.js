require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { limiter } = require("./middleware/rateLimiter");
const authRoute = require("./routes/auth.Route");
const lecturerRoute = require("./routes/lecturer.Route");
const courseRoute = require("./routes/course.Route");
const groupRoute = require("./routes/group.Route");
const studentRoute = require("./routes/student.Route");
const eventRoute = require("./routes/event.Route");
const assignmentRoute = require("./routes/assignment.Route");
const notificationRoute = require("./routes/notification.Route");
const feedbackRoute = require("./routes/feedback.Route");
const attendanceInstanceRoute = require("./routes/attendanceInstance.Route");
const googleRoute = require("./routes/google.Route");
const slideRoute = require("./routes/slides.Route");
const { captureSocketId } = require("./middleware/socketTracker");
const app = express();
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

if (process.env.NODE_ENV === "production") {
    app.use(helmet());
    app.use(limiter);
}


app.use(
  cors({
    exposedHeaders: ["Content-Disposition"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    origin: ["http://localhost:5173", "http://127.0.0.1:5500", "http://192.168.100.6:5173/"],
    credentials: true,
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(cookieParser());

// Add socket ID tracking middleware (should be after authentication)
app.use(captureSocketId);

app.use("/auth", authRoute);
app.use("/lecturers", lecturerRoute);
app.use("/courses", courseRoute);
app.use("/groups", groupRoute);
app.use("/students", studentRoute);
app.use("/events", eventRoute);
app.use("/assignments", assignmentRoute);
app.use("/notifications", notificationRoute);
app.use("/feedbacks", feedbackRoute);
app.use("/attendances", attendanceInstanceRoute);
app.use("/google", googleRoute);
app.use("/slides", slideRoute);

module.exports = app;
