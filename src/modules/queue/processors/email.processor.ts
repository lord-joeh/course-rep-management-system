import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import * as nodemailer from "nodemailer";
import * as sanitizeHtml from "sanitize-html";
import { QueueName, EmailJobType } from "../constants";
import { EmailJobData } from "../dto";
import {
  renderRegistrationSuccessTemplate,
  renderPasswordResetTemplate,
  renderPasswordChangedTemplate,
  renderGroupAssignmentTemplate,
  renderFeedbackReceivedTemplate,
  renderStudentMessageTemplate,
} from "../templates";

@Processor(QueueName.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    super();
    this.transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      host: this.configService.get<string>("SMTP_HOST", "localhost"),
      port: Number(this.configService.get<number>("SMTP_PORT", 587)),
      secure: this.configService.get<boolean>("SMTP_SECURE", false),
      auth: {
        user: this.configService.get<string>("SMTP_USER", ""),
        pass: this.configService.get<string>("SMTP_PASS", ""),
      },
    });
  }

  async process(job: Job<EmailJobData, any, string>): Promise<any> {
    const { jobType, to } = job.data;
    this.logger.log(
      `Processing email job [${job.id}] type [${jobType}] to <${to}>`,
    );

    try {
      const { html, subject } = this.generateEmailPayload(job.data);
      const from = this.configService.get<string>(
        "SMTP_SENDER",
        "Course Rep Management",
      );

      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      this.logger.log(
        `Email job [${job.id}] sent successfully: ${info.messageId}`,
      );
      return { success: true, messageId: info.messageId, to };
    } catch (error: any) {
      this.logger.error(
        `Email job [${job.id}] failed for <${to}>: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private generateEmailPayload(data: EmailJobData): {
    html: string;
    subject: string;
  } {
    const frontendUrl = this.configService.get<string>(
      "FRONTEND_URL",
      "http://localhost:3000",
    );

    switch (data.jobType) {
      case EmailJobType.REGISTRATION_SUCCESS: {
        const sanitizedName = this.sanitize(data.name || "Student");
        const sanitizedId = this.sanitize(data.studentId || "");
        return {
          subject: "Welcome to Course Rep Management System",
          html: renderRegistrationSuccessTemplate({
            name: sanitizedName,
            studentId: sanitizedId,
            loginUrl: `${frontendUrl}/login`,
          }),
        };
      }

      case EmailJobType.PASSWORD_RESET: {
        const sanitizedName = this.sanitize(data.name);
        const resetToken = data.resetToken || "";
        return {
          subject: "Password Reset Request",
          html: renderPasswordResetTemplate({
            name: sanitizedName,
            resetUrl: `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`,
            expiryMinutes: 15,
          }),
        };
      }

      case EmailJobType.PASSWORD_CHANGED: {
        const sanitizedName = this.sanitize(data.name);
        return {
          subject: "Password Changed Confirmation",
          html: renderPasswordChangedTemplate({
            name: sanitizedName,
            changedAt: new Date().toUTCString(),
          }),
        };
      }

      case EmailJobType.GROUP_ASSIGNMENT: {
        const sanitizedStudentName = this.sanitize(data.name || "Student");
        const sanitizedGroupName = this.sanitize(
          data.groupName || "Academic Group",
        );
        const members = (data.groupMembers || []).map((m, idx) => ({
          id: this.sanitize(m.id),
          name: this.sanitize(m.name),
          email: this.sanitize(m.email),
          role: idx === 0 ? "Leader" : "Member",
        }));
        const leaderName =
          members.length > 0 ? members[0].name : "Designated Leader";

        return {
          subject: `Academic Group Assigned: ${sanitizedGroupName}`,
          html: renderGroupAssignmentTemplate({
            studentName: sanitizedStudentName,
            groupName: sanitizedGroupName,
            leaderName,
            members,
          }),
        };
      }

      case EmailJobType.FEEDBACK_RECEIVED: {
        const sanitizedName = this.sanitize(data.name || "Student");
        return {
          subject: "We've Received Your Feedback - Course Rep Team",
          html: renderFeedbackReceivedTemplate({
            name: sanitizedName,
          }),
        };
      }

      case EmailJobType.STUDENT_MESSAGE: {
        const sanitizedName = this.sanitize(data.name || "Student");
        const sanitizedMessage = this.sanitize(data.message || "");
        const subject = data.subject || "Message from Course Representative";
        return {
          subject,
          html: renderStudentMessageTemplate({
            name: sanitizedName,
            messageContent: sanitizedMessage,
            subject,
          }),
        };
      }

      default:
        throw new Error(`Unsupported email job type: ${data.jobType}`);
    }
  }

  private sanitize(str?: string): string {
    if (!str) return "";
    const sanitizeFn: any =
      typeof sanitizeHtml === "function"
        ? sanitizeHtml
        : (sanitizeHtml as any).default;
    return sanitizeFn(str, {
      allowedTags: [],
      allowedAttributes: {},
    });
  }
}
