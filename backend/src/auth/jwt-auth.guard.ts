import { AuthGuard } from '@nestjs/passport';

/** Protege rotas com `Authorization: Bearer <jwt>` (RS256). */
export const JwtAuthGuard = AuthGuard('jwt');
