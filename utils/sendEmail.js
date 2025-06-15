require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.SERVICE,
  auth: {
    user: process.env.SERVICE_USER,
    pass: process.env.SERVICE_PASS,
  },
});

exports.sendNotification = async (to, subject, message) => {
  const mailOption = {
    to: to,
    subject: subject,
    html: message,
  };

  await transporter.sendMail(mailOption, (err, info) => {
    err
      ? console.log('Email failed: ' + err.message)
      : console.log('Email sent: ' + info.response);
  });
};
