require("dotenv").config();
const nodemailer = require("nodemailer");

// Create a transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

exports.sendNotification = async (to, subject, message) => {
    // Define email options
    const mailOptions = {
        from: process.env.SMTP_SENDER,
        to,
        subject,
        html: message,
    };

  try {
    // Verify transporter configuration first (promise-based)
    await transporter.verify();
    console.log(" Email configuration is valid, Server ready to send");

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info?.response || info);
    return info;
  } catch (err) {
    // Log full error and rethrow so callers can handle failures explicitly
    console.error("Email failed:", err);
    throw err;
  }
};
