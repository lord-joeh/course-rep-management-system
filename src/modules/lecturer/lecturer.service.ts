import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { Lecturer } from './entities/lecturer.entity';
import { CacheService } from '../redis/cache.service';
import { CACHE_TTL } from '../../common/constants/cache.constants';
import { CreateLecturerDto, UpdateLecturerDto, LecturerQueryDto } from './dto';
import { PaginatedResult } from '../../common/pagination';

@Injectable()
export class LecturerService {
  private readonly logger = new Logger(LecturerService.name);

  constructor(
    @InjectRepository(Lecturer)
    private readonly lecturerRepository: Repository<Lecturer>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Create and persist a new lecturer record.
   */
  async create(dto: CreateLecturerDto): Promise<Lecturer> {
    const normalizedEmail = dto.email.toLowerCase();

    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException(
        `Lecturer with email "${dto.email}" already exists`,
      );
    }

    const now = new Date();
    const lecturer = this.lecturerRepository.create({
      id: crypto.randomUUID(),
      name: dto.name,
      email: normalizedEmail,
      phone: dto.phone,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.lecturerRepository.save(lecturer);

    // Invalidate cached lecturer queries
    await this.cacheService.scanAndInvalidate('cr:lecturers:*');

    return saved;
  }

  /**
   * Retrieve paginated lecturer directory with non-blocking Redis caching.
   */
  async findPaginated(
    query: LecturerQueryDto,
  ): Promise<PaginatedResult<Lecturer>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim() || '';

    const cacheKey = `cr:lecturers:p=${page}:l=${limit}:s=${encodeURIComponent(search)}`;

    // 1. Check Redis cache
    const cached = await this.cacheService.get<PaginatedResult<Lecturer>>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Query Database
    const qb = this.lecturerRepository.createQueryBuilder('lecturer');

    if (search) {
      qb.andWhere(
        '(LOWER(lecturer.name) LIKE LOWER(:search) OR LOWER(lecturer.email) LIKE LOWER(:search) OR LOWER(lecturer.phone) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('lecturer.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<Lecturer> = {
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

    // 3. Cache in Redis for 15 minutes
    await this.cacheService.set(cacheKey, result, CACHE_TTL.FIFTEEN_MINUTES);

    return result;
  }

  /**
   * Find a lecturer by UUID.
   */
  async findById(id: string): Promise<Lecturer> {
    const lecturer = await this.lecturerRepository.findOne({ where: { id } });
    if (!lecturer) {
      throw new NotFoundException(`Lecturer with ID "${id}" not found`);
    }
    return lecturer;
  }

  /**
   * Find a lecturer by email.
   */
  async findByEmail(email: string): Promise<Lecturer | null> {
    return this.lecturerRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Update an existing lecturer record.
   */
  async update(id: string, dto: UpdateLecturerDto): Promise<Lecturer> {
    const lecturer = await this.findById(id);

    if (dto.email && dto.email.toLowerCase() !== lecturer.email?.toLowerCase()) {
      const existing = await this.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Email "${dto.email}" is already used by another lecturer`,
        );
      }
    }

    await this.lecturerRepository.update(id, {
      ...dto,
      email: dto.email ? dto.email.toLowerCase() : undefined,
      updatedAt: new Date(),
    });

    // Invalidate cached lecturer queries
    await this.cacheService.scanAndInvalidate('cr:lecturers:*');

    return this.findById(id);
  }

  /**
   * Delete a lecturer record.
   */
  async delete(id: string): Promise<{ message: string }> {
    await this.findById(id);

    await this.lecturerRepository.delete(id);

    // Invalidate cached lecturer queries
    await this.cacheService.scanAndInvalidate('cr:lecturers:*');

    return { message: `Lecturer "${id}" successfully deleted` };
  }
}

