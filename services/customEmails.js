const models = require("../config/models");
const { enqueue } = require("./enqueue");
const { handleError } = require("./errorService");
require("dotenv").config();

//Send password reset link
exports.sendResetLink = async (email, reset_token) => {
  const content = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;
         margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; color: #000000">
        <h2 style="color: #007bff;">Password Reset</h2>
        <p>Please click on the button below to reset your password</p>
        <p style="color: #ff3500">This link expires in 5 minutes</p>
        <a href="${process.env.FRONTEND_URL}/reset?token=${reset_token}" style="display: inline-block;
         padding: 10px 20px; font-size: 16px; color: #fff; background-color: #007bff; text-decoration: none;
          border-radius: 5px;">Reset Password</a>
        <p>If you didn't request for a password reset ignore this message</p>
        <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
    </div>`;

  try {
    await enqueue("sendEmail", {
      to: email,
      subject: "Password Reset",
      html: content,
    });
    console.log("Password reset link sent successfully");
  } catch (error) {
    console.log("Error sending password reset link", error);
  }
  };

//Send password reset confirmation
exports.sendResetConfirmation = async (email, name) => {
    const content = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;
         margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; color: #000000">
        <h2 style="color: #007bff;">Password Reset Successful </h2>
        <p>Dear ${name},</p>
        <p>You have successfully reset your password</p>
        
        <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
    </div>`;

    try {
        await enqueue("sendEmail", {
            to: email,
            subject: "Password Reset Confirmation",
            html: content,
        });
        console.log("Password reset confirmation sent successfully");
    } catch (error) {
        console.log("Error sending password reset confirmation", error);
    }
};

// Send registration success mail
exports.sendRegistrationSuccessMail = async (name, email, id) => {
  const content = `
  <div style="font-family: Arial, sans-serif; max-width: 600px;
         margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; color: #000000">
        <h2 style="color: #007bff;">Registration Successful</h2>
        <p>Dear ${name},</p>
        <p> Welcome aboard!</p>
        <p>Your registration with <strong> student ID: ${id} </strong>
         to the Course Rep Management System was successful.</p>
        <p> You can now access your courses, communicate with your course representatives,
          and stay updated on important announcements and academic activities.</p>
        <p>We are excited to have you on the platform and look forward to helping you stay
         connected and informed throughout your academic journey.</p>
        <a href="${process.env.FRONTEND_URL}" style="display: inline-block;
         padding: 10px 20px; font-size: 16px; color: #fff; background-color: #007bff;
          text-decoration: none;
          border-radius: 5px;">Click here to login</a>
        <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
    </div>`;
  try {
    await enqueue("sendEmail", {
      to: email,
      subject: "Welcome to the Course Rep Management System",
      html: content,
    });
    console.log("Registration mail sent successfully");
  } catch (error) {
    console.log("Error sending registration success mail");
  }
};

//Send feedback received mail
exports.sendFeedbackReceived = async (is_anonymous, id) => {
  if (is_anonymous) {
    console.log("User is anonymous ");
    return;
  }
  try {
    const student = await models.Student.findOne({
      where: { id },
      attributes: ["name", "email"],
    });
    if (!student) throw new Error("Student not found");
    const content = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;
         margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; color: #000000">
        <h2 style="color: #007bff;">Feedback Received</h2>
        <p>Dear ${student.name}, </p>
        <p>Thank you for taking the time to share your feedback with us.</p>
        <p>We’ve successfully received your message, and we truly appreciate your input.</p>
        <p>Our team will review your feedback and, if necessary, follow up with you shortly.</p>
        <p>If you have any additional thoughts or questions in the meantime, feel free to reach out.</p>
        <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
    </div>`;
    await enqueue("sendEmail", {
      to: student.email,
      subject: "We’ve Received Your Feedback  Thank You!",
      html: content,
    });
    console.log("Feedback received mail sent successfully");
  } catch (error) {
    console.log("Error sending feedback received mail", error);
  }
};

//Send group assignment mail
exports.sendGroupAssignmentEmail = async (groupName, group) => {
  try {
    // fetch student records in parallel and filter out missing ones
    const studentsResolved = await Promise.all(
      group.map(async (student) => {
        return await models.Student.findOne({
          where: { id: student.id },
          attributes: ["id", "name", "email"],
        });
      })
    );

    const students = studentsResolved.filter((s) => s && s.email);
    if (!students.length) {
      // no students to email; log and return without throwing to avoid aborting group creation
      console.warn(`No students found for group ${groupName}`);
      return;
    }

    const leader = students[0];

    const tableRows = students
      .map((s, i) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${i + 1}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.name}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.id}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.id === leader.id ? "Leader" : "Member"}</td>
      </tr>
    `)
      .join("");

    // send emails but don't fail the whole operation if one fails
    await Promise.all(
      students.map(async (student) => {
        try {
          const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2 style="color: #007bff;">New Group</h2>
              <h3>Hello ${student.name},</h3>

              <p>You have been successfully assigned to <strong>${groupName}</strong>.</p>
              <p><strong>Group Leader:</strong> ${leader.name}</p>

              <h3 style="color: #007bff;">Group Members</h3>
              <table style="border-collapse: collapse; width: 100%;">
                <thead>
                  <tr>
                    <th style="padding:8px;border:1px solid #ddd;background:#f2f2f2;">#</th>
                    <th style="padding:8px;border:1px solid #ddd;background:#f2f2f2;">Name</th>
                    <th style="padding:8px;border:1px solid #ddd;background:#f2f2f2;">Index Number</th>
                    <th style="padding:8px;border:1px solid #ddd;background:#f2f2f2;">Role</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>

              <p>Please reach out to your group members and prepare for upcoming tasks.</p>
              <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
            </div>
          `;
          await enqueue("sendEmail", {
            to: student.email,
            subject: `Your Group Assignment: ${groupName}`,
            html: html,
          });
        } catch (e) {
          console.error(`Failed to send email to student ${student.id}:`, e.message || e);
        }
      })
    );
    console.log(`Group assignment email process completed for ${groupName}`);
  } catch (err) {
    console.error("Error sending group assignment email:", err.message || err);
    // do not throw here to avoid breaking group creation flow
  }
};

// Send custom message to student
exports.sendMessageToStudent = async (email, message) => {
  const customEmail = `
  <div style="font-family: Arial, sans-serif; max-width: 600px;
   margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; color: #000000">
    <p>Hello,</p>
    <p>${message}</p>

     <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
   </div>
  `;
  try {
    await enqueue("sendEmail", {
      to: email,
      subject: "Urgent!!",
      html: customEmail,
    });
    console.log(`Message sent to ${email} wait for confirmation`);
  } catch (error) {
    throw error;
  }
};
