require('dotenv').config();
const express = require('express');
const cors = require('cors');
const lecturerRoute = require('./routes/lecturerRoute');

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//ROUTES
app.use('/lecturer', lecturerRoute);

module.exports = app;
