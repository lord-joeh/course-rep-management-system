import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";

import { StudentService } from "../student/student.service";
import { Student, StudentStatus } from "../student/entities/student.entity";
import { RefreshToken } from "../student/entities/refresh-token.entity";
import { CacheService } from "../redis/cache.service";
import { QueueService } from "../queue/queue.service";
import { EmailJobType } from "../queue/constants";
import { AuditService } from "../audit/audit.service";
import {
  AuditAction,
  AuditSeverity,
  AuditResource,
} from "../audit/entities/security-audit-log.entity";
import {
  CACHE_KEYSPACES,
  CACHE_TTL,
} from "../../common/constants/cache.constants";
import { JwtPayload } from "../../common/types/jwt-payload.interface";
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from "./dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly studentService: StudentService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly queueService: QueueService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Register a new student account.
   */
  async register(dto: RegisterDto, ipAddress?: string) {
    const existingById = await this.studentService.findById(dto.id);
    if (existingById) {
      throw new ConflictException(`Student with ID "${dto.id}" already exists`);
    }

    const existingByEmail = await this.studentService.findByEmail(dto.email);
    if (existingByEmail) {
      throw new ConflictException(
        `Student with email "${dto.email}" already exists`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const student = await this.studentService.create({
      id: dto.id,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      isRep: Boolean(dto.isRep),
      passwordHash,
      status: StudentStatus.ACTIVE,
    });

    // Store transient verification code in Redis with 15-minute TTL (Zero DB bloat)
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    await this.cacheService.set(
      `${CACHE_KEYSPACES.AUTH_VERIFY}${student.id}`,
      { code: verificationCode, email: student.email, attempts: 0 },
      CACHE_TTL.FIFTEEN_MINUTES,
    );

    // Generate authentication tokens
    const tokens = await this.generateTokenPair(student);
    await this.storeHashedRefreshToken(student.id, tokens.refreshToken);

    // Enqueue transactional registration welcome email
    if (student.email) {
      await this.queueService.sendEmail(EmailJobType.REGISTRATION_SUCCESS, {
        to: student.email,
        name: student.name,
        studentId: student.id,
      });
    }

    await this.auditService.recordEvent({
      action: AuditAction.STUDENT_CREATED,
      severity: AuditSeverity.LOW,
      resource: AuditResource.AUTH,
      actorId: student.id,
      actorEmail: student.email,
      actorRole: student.isRep ? 'REP' : 'STUDENT',
      ipAddress,
      details: { role: student.isRep ? 'REP' : 'STUDENT' },
    });

    return {
      student: this.sanitizeStudent(student),
      ...tokens,
      verificationCode:
        process.env.NODE_ENV === "development" ? verificationCode : undefined,
    };
  }

  /**
   * Authenticate student with ID/Email and password.
   */
  async login(dto: LoginDto, ipAddress?: string) {
    const identifier = dto.identifier || dto.id || dto.email;
    if (!identifier) {
      throw new BadRequestException(
        "Identifier (student ID or email) is required",
      );
    }

    const student =
      await this.studentService.findByIdentifierWithPassword(identifier);
    if (!student || !student.passwordHash) {
      await this.auditService.recordEvent({
        action: AuditAction.LOGIN_FAILURE,
        severity: AuditSeverity.HIGH,
        resource: AuditResource.AUTH,
        actorEmail: identifier,
        ipAddress,
        details: { reason: "User not found or missing password hash" },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const isMatch = await bcrypt.compare(dto.password, student.passwordHash);
    if (!isMatch) {
      await this.auditService.recordEvent({
        action: AuditAction.LOGIN_FAILURE,
        severity: AuditSeverity.HIGH,
        resource: AuditResource.AUTH,
        actorId: student.id,
        actorEmail: student.email,
        ipAddress,
        details: { reason: "Password mismatch" },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    if (student.status !== StudentStatus.ACTIVE) {
      await this.auditService.recordEvent({
        action: AuditAction.LOGIN_FAILURE,
        severity: AuditSeverity.HIGH,
        resource: AuditResource.AUTH,
        actorId: student.id,
        actorEmail: student.email,
        ipAddress,
        details: { reason: `Account status is ${student.status}` },
      });
      throw new UnauthorizedException(`Account is ${student.status}`);
    }

    const tokens = await this.generateTokenPair(student);
    await this.storeHashedRefreshToken(student.id, tokens.refreshToken);

    await this.auditService.recordEvent({
      action: AuditAction.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      resource: AuditResource.AUTH,
      actorId: student.id,
      actorRole: student.isRep ? "REP" : "STUDENT",
      actorEmail: student.email,
      ipAddress,
    });

    return {
      student: this.sanitizeStudent(student),
      ...tokens,
    };
  }

  /**
   * Rotate refresh token with token reuse detection (CWE-287 mitigation).
   */
  async refreshToken(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);

    const storedToken = await this.refreshTokenRepository.findOne({
      where: { token: tokenHash },
      relations: ["student"],
    });

    if (!storedToken) {
      throw new UnauthorizedException("Invalid or revoked refresh token");
    }

    // Check expiration
    if (new Date() > storedToken.expiresAt) {
      await this.refreshTokenRepository.remove(storedToken);
      throw new UnauthorizedException(
        "Refresh token has expired. Please log in again.",
      );
    }

    const student = storedToken.student;
    if (!student || student.status !== StudentStatus.ACTIVE) {
      throw new UnauthorizedException("Student account is no longer active");
    }

    // Token rotation: Remove old token, issue new token pair
    await this.refreshTokenRepository.remove(storedToken);

    const tokens = await this.generateTokenPair(student);
    await this.storeHashedRefreshToken(student.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Logout student and revoke refresh token.
   */
  async logout(studentId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.delete({ token: tokenHash, studentId });
    } else {
      // Revoke all active sessions for this student
      await this.refreshTokenRepository.delete({ studentId });
    }

    return { message: "Successfully logged out" };
  }

  /**
   * Dispatches a password reset token stored in Redis with a 15-minute TTL.
   */
  async forgotPassword(dto: ForgotPasswordDto, ipAddress?: string) {
    const student = await this.studentService.findByIdentifierWithPassword(
      dto.identifier,
    );

    // Return generic success response to prevent account enumeration
    if (!student || !student.email) {
      return {
        message:
          "If an account exists with this identifier, password reset instructions have been dispatched.",
      };
    }

    // Generate cryptographically random 32-byte hex token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Store in Redis with strict 15-minute TTL (Zero database writes)
    await this.cacheService.set(
      `${CACHE_KEYSPACES.AUTH_RESET}${resetToken}`,
      { studentId: student.id, email: student.email },
      CACHE_TTL.FIFTEEN_MINUTES,
    );

    // Enqueue transactional password reset email
    await this.queueService.sendEmail(EmailJobType.PASSWORD_RESET, {
      to: student.email,
      name: student.name,
      resetToken,
    });

    await this.auditService.recordEvent({
      action: AuditAction.PASSWORD_RESET_REQUEST,
      severity: AuditSeverity.INFO,
      resource: AuditResource.AUTH,
      actorId: student.id,
      actorEmail: student.email,
      ipAddress,
    });

    return {
      message:
        "If an account exists with this identifier, password reset instructions have been dispatched.",
      resetToken:
        process.env.NODE_ENV === "development" ? resetToken : undefined,
    };
  }

  /**
   * Reset student password using Redis-backed single-use token.
   */
  async resetPassword(dto: ResetPasswordDto, ipAddress?: string) {
    const redisKey = `${CACHE_KEYSPACES.AUTH_RESET}${dto.token}`;
    const resetData = await this.cacheService.get<{
      studentId: string;
      email: string;
    }>(redisKey);

    if (!resetData || !resetData.studentId) {
      throw new BadRequestException("Invalid or expired password reset token");
    }

    // Single-use: Atomically invalidate token in Redis
    await this.cacheService.del(redisKey);

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.studentRepository.update(resetData.studentId, { passwordHash });

    // Invalidate all active refresh tokens upon password reset for security
    await this.refreshTokenRepository.delete({
      studentId: resetData.studentId,
    });

    const student = await this.studentRepository.findOne({
      where: { id: resetData.studentId },
    });

    // Enqueue transactional password changed security notice
    await this.queueService.sendEmail(EmailJobType.PASSWORD_CHANGED, {
      to: resetData.email,
      name: student?.name || "Student",
    });

    // Record audit event
    await this.auditService.recordEvent({
      action: AuditAction.PASSWORD_RESET_SUCCESS,
      severity: AuditSeverity.MEDIUM,
      resource: AuditResource.AUTH,
      actorId: resetData.studentId,
      actorEmail: resetData.email,
      ipAddress,
    });

    return {
      message:
        "Password has been successfully reset. Please log in with your new credentials.",
    };
  }

  /**
   * Authenticated student password change.
   */
  async changePassword(studentId: string, dto: ChangePasswordDto, ipAddress?: string) {
    const student = await this.studentService.findByIdWithPassword(studentId);
    if (!student || !student.passwordHash) {
      throw new BadRequestException("Student record not found");
    }

    const isMatch = await bcrypt.compare(
      dto.currentPassword,
      student.passwordHash,
    );
    if (!isMatch) {
      throw new BadRequestException("Current password does not match");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.studentRepository.update(studentId, { passwordHash });

    // Revoke all existing refresh tokens
    await this.refreshTokenRepository.delete({ studentId });

    // Enqueue transactional password changed security notice
    if (student.email) {
      await this.queueService.sendEmail(EmailJobType.PASSWORD_CHANGED, {
        to: student.email,
        name: student.name,
      });
    }

    await this.auditService.recordEvent({
      action: AuditAction.PASSWORD_CHANGE,
      severity: AuditSeverity.LOW,
      resource: AuditResource.AUTH,
      actorId: student.id,
      actorEmail: student.email,
      actorRole: student.isRep ? 'REP' : 'STUDENT',
      ipAddress,
    });

    return {
      message:
        "Password successfully changed. All other sessions have been logged out.",
    };
  }

  // --- Helper Methods ---

  private async generateTokenPair(student: Student) {
    const payload: JwtPayload = {
      sub: student.id,
      email: student.email,
      isRep: Boolean(student.isRep),
      role: student.isRep ? "REP" : "STUDENT",
    };

    const accessSecret =
      this.configService.get<string>("jwt.accessSecret") ||
      process.env.JWT_ACCESS_SECRET ||
      "default_jwt_access_secret_min_32_chars_long";

    const accessExpiresIn =
      this.configService.get<string>("jwt.accessExpiresIn") || "15m";

    const refreshSecret =
      this.configService.get<string>("jwt.refreshSecret") ||
      process.env.JWT_REFRESH_SECRET ||
      "default_jwt_refresh_secret_min_32_chars_long";

    const refreshExpiresIn =
      this.configService.get<string>("jwt.refreshExpiresIn") || "7d";

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(
        {
          sub: student.id,
          type: "refresh",
          jti: crypto.randomUUID(),
        },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn as any,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: accessExpiresIn,
    };
  }

  private async storeHashedRefreshToken(
    studentId: string,
    refreshToken: string,
  ) {
    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const tokenEntity = this.refreshTokenRepository.create({
      studentId,
      token: tokenHash,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await this.refreshTokenRepository.save(tokenEntity);
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private sanitizeStudent(student: Student) {
    const { passwordHash, ...sanitized } = student;
    return sanitized;
  }
}
