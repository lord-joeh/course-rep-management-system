require("dotenv").config();
const nodemailer = require("nodemailer");

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

  let response = "";

  transporter.sendMail(mailOption, (err, info) => {
    if (info) {
      console.log("Email sent: ", info?.response);
      response = info.response;
    }
    if (err) {
      console.log("Email failed: ", err);
      response = err.message;
    }
  });
};
