import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesktopUpdateBundle } from './entities/desktop-update-bundle.entity';
import { DesktopUpdatesController } from './desktop-updates.controller';
import { DesktopUpdatesService } from './desktop-updates.service';
import { DesktopUpdatesPublishGuard } from './guards/desktop-updates-publish.guard';

@Module({
  imports: [TypeOrmModule.forFeature([DesktopUpdateBundle])],
  controllers: [DesktopUpdatesController],
  providers: [DesktopUpdatesService, DesktopUpdatesPublishGuard],
  exports: [DesktopUpdatesService],
})
export class DesktopUpdatesModule {}
