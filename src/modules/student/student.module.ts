import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './entities/student.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { StudentService } from './student.service';
import { StudentController } from './student.controller';
import { StudentOwnershipGuard } from '../../common/guards/student-ownership.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Student, RefreshToken])],
  controllers: [StudentController],
  providers: [StudentService, StudentOwnershipGuard],
  exports: [StudentService, TypeOrmModule],
})
export class StudentModule {}
