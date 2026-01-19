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
const { corsOptions } = require("./config/corsOptions");

const trustProxy = process.env.TRUST_PROXY ?? "1";
app.set("trust proxy", trustProxy);

app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(captureSocketId);
app.use(limiter);

app.use("/api/auth", authRoute);
app.use("/api/lecturers", lecturerRoute);
app.use("/api/courses", courseRoute);
app.use("/api/groups", groupRoute);
app.use("/api/students", studentRoute);
app.use("/api/events", eventRoute);
app.use("/api/assignments", assignmentRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/feedbacks", feedbackRoute);
app.use("/api/attendance", attendanceInstanceRoute);
app.use("/api/google", googleRoute);
app.use("/api/slides", slideRoute);

module.exports = app;
