const {
  emitToUser,
  emitToUsers,
  isUserConnected,
} = require("../middleware/socketTracker");
const { getSocketIO } = require("../middleware/socketIO");

/**
 * Service for handling socket messaging throughout the application
 */
class SocketMessagingService {
  /**
   * Send a notification to a specific user
   * @param {string} userId - The user ID to send the message to
   * @param {string} type - The type of notification
   * @param {string} title - The notification title
   * @param {string} message - The notification message
   * @param {object} data - Additional data to include
   * @returns {boolean} - True if message was sent successfully
   */
  static sendNotificationToUser(userId, type, title, message, data = {}) {
    const notificationData = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    return emitToUser(userId, "notification", notificationData);
  }

  /**
   * Send a notification to multiple users
   * @param {string[]} userIds - Array of user IDs to send the message to
   * @param {string} type - The type of notification
   * @param {string} title - The notification title
   * @param {string} message - The notification message
   * @param {object} data - Additional data to include
   * @returns {number} - Number of users the message was sent to
   */
  static sendNotificationToUsers(userIds, type, title, message, data = {}) {
    const notificationData = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    return emitToUsers(userIds, "notification", notificationData);
  }

  /**
   * Send a broadcast message to all connected users
   * @param {string} type - The type of message
   * @param {string} title - The message title
   * @param {string} message - The message content
   * @param {object} data - Additional data to include
   * @returns {number} - Number of users the message was sent to
   */
  static broadcastMessage(type, title, message, data = {}) {
    const notificationData = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    try {
      const io = getSocketIO();
      io.emit("notification", notificationData);
      // Also emit specific type if needed, but the original implementation wrapped it in notification structure
      return true;
    } catch (e) {
      console.error("Broadcast failed:", e);
      return false;
    }
  }

  /**
   * Send a real-time update about student registration
   * @param {object} student - The student object
   */
  static notifyStudentRegistration(student) {
    this.broadcastMessage(
      "student_registration",
      "New Student Registered",
      `Student ${student.name} (${student.id}) has been registered`,
      { student }
    );
  }

  /**
   * Send a real-time update about student profile changes
   * @param {string} studentId - The student ID
   * @param {object} updatedData - The updated student data
   */
  static notifyStudentProfileUpdate(studentId, updatedData) {
    this.sendNotificationToUser(
      studentId,
      "profile_update",
      "Profile Updated",
      "Your profile has been updated successfully",
      { student: updatedData }
    );
  }

  /**
   * Send a real-time update about course changes
   * @param {string[]} studentIds - Array of student IDs enrolled in the course
   * @param {object} course - The course object
   * @param {string} action - The action performed (created, updated, deleted)
   */
  static notifyCourseChange(studentIds, course, action) {
    const actionMessages = {
      created: "A new course has been added",
      updated: "A course has been updated",
      deleted: "A course has been removed",
    };

    this.sendNotificationToUsers(
      studentIds,
      "course_change",
      `Course ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      actionMessages[action] || `Course ${action}`,
      { course, action }
    );
  }

  /**
   * Send a real-time update about event changes
   * @param {string[]} studentIds - Array of student IDs to notify
   * @param {object} event - The event object
   * @param {string} action - The action performed (created, updated, deleted)
   */
  static notifyEventChange(studentIds, event, action) {
    const actionMessages = {
      created: "A new event has been scheduled",
      updated: "An event has been updated",
      deleted: "An event has been cancelled",
    };

    this.sendNotificationToUsers(
      studentIds,
      "event_change",
      `Event ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      actionMessages[action] || `Event ${action}`,
      { event, action }
    );
  }

  /**
   * Send a real-time update about assignment changes
   * @param {string[]} studentIds - Array of student IDs to notify
   * @param {object} assignment - The assignment object
   * @param {string} action - The action performed (created, updated, deleted)
   */
  static notifyAssignmentChange(studentIds, assignment, action) {
    const actionMessages = {
      created: "A new assignment has been posted",
      updated: "An assignment has been updated",
      deleted: "An assignment has been removed",
    };

    this.sendNotificationToUsers(
      studentIds,
      "assignment_change",
      `Assignment ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      actionMessages[action] || `Assignment ${action}`,
      { assignment, action }
    );
  }

  /**
   * Send a real-time update about group changes
   * @param {string[]} memberIds - Array of group member IDs to notify
   * @param {object} group - The group object
   * @param {string} action - The action performed (created, updated, deleted)
   */
  static notifyGroupChange(memberIds, group, action) {
    const actionMessages = {
      created: "You have been added to a new group",
      updated: "A group you belong to has been updated",
      deleted: "A group you belonged to has been removed",
    };

    this.sendNotificationToUsers(
      memberIds,
      "group_change",
      `Group ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      actionMessages[action] || `Group ${action}`,
      { group, action }
    );
  }

  /**
   * Send a real-time update about attendance changes
   * @param {string[]} studentIds - Array of student IDs to notify
   * @param {object} attendance - The attendance object
   * @param {string} action - The action performed (created, updated, deleted)
   */
  static notifyAttendanceChange(studentIds, attendance, action) {
    const actionMessages = {
      created: "Attendance has been marked",
      updated: "Attendance record has been updated",
      deleted: "Attendance record has been removed",
    };

    this.sendNotificationToUsers(
      studentIds,
      "attendance_change",
      `Attendance ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      actionMessages[action] || `Attendance ${action}`,
      { attendance, action }
    );
  }

  /**
   * Send a system message to a specific user
   * @param {string} userId - The user ID
   * @param {string} message - The system message
   * @param {object} data - Additional data
   */
  static sendSystemMessage(userId, message, data = {}) {
    this.sendNotificationToUser(
      userId,
      "system_message",
      "System Message",
      message,
      data
    );
  }

  /**
   * Send an error notification to a specific user
   * @param {string} userId - The user ID
   * @param {string} message - The error message
   * @param {object} data - Additional error data
   */
  static sendErrorNotification(userId, message, data = {}) {
    this.sendNotificationToUser(userId, "error", "Error", message, data);
  }

  /**
   * Check if a user is connected and send a message if they are
   * @param {string} userId - The user ID to check
   * @param {string} type - The message type
   * @param {string} title - The message title
   * @param {string} message - The message content
   * @param {object} data - Additional data
   * @returns {boolean} - True if user was connected and message was sent
   */
  static sendIfConnected(userId, type, title, message, data = {}) {
    if (isUserConnected(userId)) {
      return this.sendNotificationToUser(userId, type, title, message, data);
    }
    return false;
  }
}

module.exports = SocketMessagingService;
