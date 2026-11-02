import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleToken } from './entities/google-token.entity';
import { EncryptionService } from './services/encryption.service';
import { GoogleAuthService } from './services/google-auth.service';
import { GoogleDriveService } from './services/google-drive.service';
import { GoogleController } from './google.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GoogleToken])],
  controllers: [GoogleController],
  providers: [EncryptionService, GoogleAuthService, GoogleDriveService],
  exports: [EncryptionService, GoogleAuthService, GoogleDriveService, TypeOrmModule],
})
export class GoogleModule {}

