require('dotenv').config();
const express = require('express');
const cors = require('cors');
const lecturerRoute = require('./routes/lecturerRoute');
const courseRoute = require('./routes/courseRoute')

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//ROUTES
app.use('/lecturer', lecturerRoute);
app.use('/course', courseRoute)

module.exports = app;
