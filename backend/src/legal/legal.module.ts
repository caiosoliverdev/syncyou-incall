import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalDocument } from './entities/legal-document.entity';
import { LegalController } from './legal.controller';
import { LegalSeedService } from './legal-seed.service';
import { LegalService } from './legal.service';

@Module({
  imports: [TypeOrmModule.forFeature([LegalDocument])],
  controllers: [LegalController],
  providers: [LegalService, LegalSeedService],
  exports: [LegalService],
})
export class LegalModule {}
