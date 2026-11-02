import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lecturer } from './entities/lecturer.entity';
import { LecturerService } from './lecturer.service';
import { LecturerController } from './lecturer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Lecturer])],
  controllers: [LecturerController],
  providers: [LecturerService],
  exports: [LecturerService, TypeOrmModule],
})
export class LecturerModule {}

