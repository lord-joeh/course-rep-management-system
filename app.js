require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoute = require('./routes/authRoute');
const lecturerRoute = require('./routes/lecturerRoute');
const courseRoute = require('./routes/courseRoute');
const groupRoute = require('./routes/groupRoute');
const studentRoute = require('./routes/studentRoute');
const eventRoute = require('./routes/eventRoute');
const assignmentRoute = require('./routes/assignmentRoute');
const notificationRoute = require('./routes/notificationRoute');
const feedbackRoute = require('./routes/feedbackRoute');
const attendanceInstanceRoute = require('./routes/attendanceInstanceRoute');
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//ROUTES
app.use('/auth', authRoute);
app.use('/lecturer', lecturerRoute);
app.use('/course', courseRoute);
app.use('/group', groupRoute);
app.use('/student', studentRoute);
app.use('/event', eventRoute);
app.use('/assignment', assignmentRoute);
app.use('/notification', notificationRoute);
app.use('/feedback', feedbackRoute);
app.use('/attendance', attendanceInstanceRoute);

module.exports = app;
