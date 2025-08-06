const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false,
  }
);

const Student = require('../models/Student')(sequelize);
const Lecturer = require('../models/Lecturer')(sequelize);
const Course = require('../models/Course')(sequelize);
const Assignment = require('../models/Assignment')(sequelize);
const AttendanceInstance = require('../models/AttendanceInstance')(sequelize);
const Attendance = require('../models/Attendance')(sequelize);
const Event = require('../models/Event')(sequelize);
const Feedback = require('../models/Feedback')(sequelize);
const Notification = require('../models/Notification')(sequelize);
const Group = require('../models/Group')(sequelize);
const GroupMember = require('../models/GroupMember')(sequelize);
const CourseStudent = require('../models/CourseStudent')(sequelize);
const Verification = require('../models/Verification')(sequelize);
const SecurityLog = require('../models/SecurityLog')(sequelize);
const AttendanceLog = require('../models/AttendanceLog')(sequelize);
const GoogleToken = require('../models/GoogleToken')(sequelize)

const models = {
  Student,
  Lecturer,
  Course,
  Assignment,
  AttendanceInstance,
  Attendance,
  Event,
  Feedback,
  Notification,
  Group,
  GroupMember,
  CourseStudent,
  Verification,
  SecurityLog,
  AttendanceLog,
  GoogleToken
};


Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = { sequelize, models };
