import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserPayload } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações recentes' })
  async list(@CurrentUser() user: AuthUserPayload) {
    return this.notificationsService.listForUser(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar como lida' })
  async markRead(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificationsService.markRead(user.userId, id);
    return { ok: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  async markAllRead(@CurrentUser() user: AuthUserPayload) {
    await this.notificationsService.markAllRead(user.userId);
    return { ok: true };
  }
}
