import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Liveness / readiness' })
  @ApiOkResponse({
    description: 'Serviço em execução',
    type: HealthResponseDto,
  })
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
