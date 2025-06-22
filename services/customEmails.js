const { connect } = require('../config/db');
const { sendNotification } = require('../utils/sendEmail');
require('dotenv').config();

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
    await sendNotification(email, 'Password Reset', content);
    console.log('Password reset link sent successfully');
  } catch (error) {
    console.log('Error sending password reset link', error);
  }
};

//Send success mail after student registration
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
        <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block;
         padding: 10px 20px; font-size: 16px; color: #fff; background-color: #007bff;
          text-decoration: none;
          border-radius: 5px;">Click here to login</a>
        <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
    </div>`;
  try {
    await sendNotification(
      email,
      'Welcome to the Course Rep Management System',
      content,
    );
    console.log('Registration mail sent successfully');
  } catch (error) {
    console.log('Error sending registration success mail');
  }
};

//Send feedback received mail
exports.sendFeedbackReceived = async (is_anonymous, id) => {
  let client;
  try {
    client = await connect();

    if (is_anonymous) {
      console.log('User is anonymous ');

      return;
    }

    const student = await client.query(
      `SELECT name, email FROM student WHERE id = $1`,
      [id],
    );

    const content = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;
         margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; color: #000000">
        <h2 style="color: #007bff;">Feedback Received</h2>
        <p>Dear ${student.rows[0].name}, </p>
        <p>Thank you for taking the time to share your feedback with us.</p>
        <p>We’ve successfully received your message, and we truly appreciate your input.</p>
        <p>Our team will review your feedback and, if necessary, follow up with you shortly.</p>
        <p>If you have any additional thoughts or questions in the meantime, feel free to reach out.</p>
        <p>Best regards,<br/><strong>Course Rep Management Team</strong></p>
    </div>`;

    await sendNotification(
      student.rows[0].email,
      'We’ve Received Your Feedback  Thank You!',
      content,
    );
    console.log('Feedback received mail sent successfully');
  } catch (error) {
    console.log('Error sending feedback received mail', error);
  } finally {
    if (client) client.release();
  }
};

//Send group assignment mail
exports.sendGroupAssignmentEmail = async (groupName, group) => {
  let client;
  try {
    client = await connect();

    // Fetch student data
    const students = await Promise.all(
      group.map(async (student) => {
        const result = await client.query(
          `SELECT id, name, email FROM student WHERE id = $1`,
          [student.id],
        );
        return result.rows[0];
      }),
    );

    if (!students.length) throw new Error('No students found for group');

    const leader = students[0]; // first member is leader

    // Build table rows
    const tableRows = students
      .map(
        (s, i) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${i + 1}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.name}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.id}</td>
        <td style="padding:8px;border:1px solid #ddd;">${
          s.id === leader.id ? 'Leader' : 'Member'
        }</td>
      </tr>
    `,
      )
      .join('');

    // Send email to each student
    await Promise.all(
      students.map(async (student) => {
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

        await sendNotification(
          student.email,
          `Your Group Assignment: ${groupName}`,
          html,
        );
      }),
    );

    console.log(`Group assignment email sent to all members of ${groupName}`);
  } catch (err) {
    console.error('Error sending group assignment email:', err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
};
