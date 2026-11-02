import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Student, StudentStatus } from "./entities/student.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { CacheService } from "../redis/cache.service";
import { CACHE_TTL } from "../../common/constants/cache.constants";
import { StudentQueryDto, RepUpdateStudentDto } from "./dto";
import { PaginatedResult } from "../../common/pagination";

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Find a student by ID (excludes passwordHash by default).
   */
  async findById(id: string): Promise<Student | null> {
    return this.studentRepository.findOne({ where: { id } });
  }

  /**
   * Find a student by email.
   */
  async findByEmail(email: string): Promise<Student | null> {
    return this.studentRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Find a student by ID or email and explicitly select passwordHash for authentication.
   */
  async findByIdentifierWithPassword(
    identifier: string,
  ): Promise<Student | null> {
    return this.studentRepository
      .createQueryBuilder("student")
      .addSelect("student.passwordHash")
      .where(
        "student.id = :identifier OR LOWER(student.email) = LOWER(:identifier)",
        {
          identifier,
        },
      )
      .getOne();
  }

  /**
   * Find a student by ID with passwordHash explicitly selected.
   */
  async findByIdWithPassword(id: string): Promise<Student | null> {
    return this.studentRepository
      .createQueryBuilder("student")
      .addSelect("student.passwordHash")
      .where("student.id = :id", { id })
      .getOne();
  }

  /**
   * Create and persist a new student.
   */
  async create(studentData: Partial<Student>): Promise<Student> {
    const now = new Date();
    const student = this.studentRepository.create({
      ...studentData,
      email: studentData.email
        ? studentData.email.toLowerCase()
        : studentData.email,
      status: studentData.status || StudentStatus.ACTIVE,
      createdAt: studentData.createdAt || now,
      updatedAt: studentData.updatedAt || now,
    });
    return this.studentRepository.save(student);
  }

  /**
   * Retrieve paginated student directory with non-blocking Redis caching.
   */
  async findPaginated(
    query: StudentQueryDto,
  ): Promise<PaginatedResult<Student>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim() || "";
    const status = query.status || "";
    const isRep = query.isRep !== undefined ? String(query.isRep) : "";

    const cacheKey = `cr:students:p=${page}:l=${limit}:s=${encodeURIComponent(search)}:st=${status}:r=${isRep}`;

    // 1. Check Redis cache
    const cached =
      await this.cacheService.get<PaginatedResult<Student>>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Query Database
    const qb = this.studentRepository.createQueryBuilder("student");

    if (search) {
      qb.andWhere(
        "(LOWER(student.name) LIKE LOWER(:search) OR LOWER(student.email) LIKE LOWER(:search) OR LOWER(student.id) LIKE LOWER(:search))",
        { search: `%${search}%` },
      );
    }

    if (query.status) {
      qb.andWhere("student.status = :status", { status: query.status });
    }

    if (query.isRep !== undefined) {
      qb.andWhere("student.isRep = :isRep", { isRep: query.isRep });
    }

    qb.orderBy("student.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<Student> = {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    // 3. Cache for 5 minutes in Redis
    await this.cacheService.set(cacheKey, result, CACHE_TTL.FIVE_MINUTES);

    return result;
  }

  /**
   * Course Rep administrative update of student details.
   */
  async repUpdate(
    studentId: string,
    dto: RepUpdateStudentDto,
  ): Promise<Student> {
    const student = await this.findById(studentId);
    if (!student) {
      throw new NotFoundException(`Student with ID "${studentId}" not found`);
    }

    if (dto.email && dto.email.toLowerCase() !== student.email?.toLowerCase()) {
      const existing = await this.findByEmail(dto.email);
      if (existing && existing.id !== studentId) {
        throw new ConflictException(
          `Email "${dto.email}" is already used by another student`,
        );
      }
    }

    await this.studentRepository.update(studentId, {
      ...dto,
      email: dto.email ? dto.email.toLowerCase() : undefined,
      updatedAt: new Date(),
    });

    // Invalidate student directory cache
    await this.cacheService.scanAndInvalidate("cr:students:*");

    const updated = await this.findById(studentId);
    return updated!;
  }

  /**
   * Course Rep administrative deletion of a student record.
   */
  async delete(studentId: string): Promise<{ message: string }> {
    const student = await this.findById(studentId);
    if (!student) {
      throw new NotFoundException(`Student with ID "${studentId}" not found`);
    }

    // Cascade revoke refresh tokens
    await this.refreshTokenRepository.delete({ studentId });
    await this.studentRepository.delete(studentId);

    // Invalidate student directory cache
    await this.cacheService.scanAndInvalidate("cr:students:*");

    return { message: `Student "${studentId}" successfully deleted` };
  }
}
