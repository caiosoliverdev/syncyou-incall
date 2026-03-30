import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserPayload } from '../auth/decorators/current-user.decorator';
import { ContactsService } from './contacts.service';
import { InviteByEmailDto } from './dto/invite-by-email.dto';
import { InviteByUserDto } from './dto/invite-by-user.dto';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('friends')
  @ApiOperation({ summary: 'Lista amigos aceites' })
  @ApiResponse({ status: 200 })
  async listFriends(@CurrentUser() user: AuthUserPayload) {
    return this.contactsService.listFriends(user.userId);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Pedidos de amizade (entrada e saída)' })
  @ApiResponse({ status: 200 })
  async listRequests(@CurrentUser() user: AuthUserPayload) {
    return this.contactsService.listRequests(user.userId);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'Contactos que bloqueou (pode desbloquear)' })
  @ApiResponse({ status: 200 })
  async listBlocked(@CurrentUser() user: AuthUserPayload) {
    return this.contactsService.listBlockedByMe(user.userId);
  }

  @Get('peers/:peerUserId/profile')
  @ApiOperation({
    summary: 'Perfil público do amigo (telefone, redes, site)',
  })
  @ApiResponse({ status: 200 })
  async getPeerProfile(
    @CurrentUser() user: AuthUserPayload,
    @Param('peerUserId', ParseUUIDPipe) peerUserId: string,
  ) {
    return this.contactsService.getFriendPeerProfile(user.userId, peerUserId);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Convidar por email' })
  @ApiResponse({ status: 201 })
  async invite(
    @CurrentUser() user: AuthUserPayload,
    @Body() body: InviteByEmailDto,
  ) {
    return this.contactsService.inviteByEmail(user.userId, body.email);
  }

  @Post('invite/user')
  @ApiOperation({ summary: 'Enviar pedido de amizade por ID de utilizador' })
  @ApiResponse({ status: 201 })
  async inviteByUser(
    @CurrentUser() user: AuthUserPayload,
    @Body() body: InviteByUserDto,
  ) {
    return this.contactsService.inviteByUserId(user.userId, body.peerUserId);
  }

  @Post('requests/:id/accept')
  @ApiOperation({ summary: 'Aceitar pedido recebido' })
  async accept(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contactsService.acceptRequest(user.userId, id);
    return { ok: true };
  }

  @Post('requests/:id/reject')
  @ApiOperation({ summary: 'Recusar pedido recebido' })
  async reject(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contactsService.rejectRequest(user.userId, id);
    return { ok: true };
  }

  @Delete('requests/:id')
  @ApiOperation({ summary: 'Cancelar pedido enviado' })
  async cancelOutgoing(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contactsService.cancelOutgoing(user.userId, id);
    return { ok: true };
  }

  @Post('peers/:peerUserId/block')
  @ApiOperation({ summary: 'Bloquear amigo' })
  async block(
    @CurrentUser() user: AuthUserPayload,
    @Param('peerUserId', ParseUUIDPipe) peerUserId: string,
  ) {
    await this.contactsService.blockPeer(user.userId, peerUserId);
    return { ok: true };
  }

  @Post('peers/:peerUserId/unblock')
  @ApiOperation({ summary: 'Desbloquear (quem bloqueou)' })
  async unblock(
    @CurrentUser() user: AuthUserPayload,
    @Param('peerUserId', ParseUUIDPipe) peerUserId: string,
  ) {
    await this.contactsService.unblockPeer(user.userId, peerUserId);
    return { ok: true };
  }
}
