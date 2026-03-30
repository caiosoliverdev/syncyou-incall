/** Forma do namespace `jwt` em `ConfigService` (registerAs em `config/jwt.config.ts`). */
export type JwtConfigSlice = {
  keysDir: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
  passwordResetExpiresIn: string;
  issuer: string;
};
