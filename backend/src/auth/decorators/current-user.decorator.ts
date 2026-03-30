import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** `sessionId` = id do refresh token emissão actual (claim `sid` no JWT). */
export type AuthUserPayload = { userId: string; sessionId?: string };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUserPayload }>();
    return req.user;
  },
);
