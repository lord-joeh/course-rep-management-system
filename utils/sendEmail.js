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

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOption, (err, info) => {
      if (err) {
        console.error("Email failed:", err);
        return reject(err);
      }
      console.log("Email sent:", info?.response);
      resolve(info);
    });
  });
};
