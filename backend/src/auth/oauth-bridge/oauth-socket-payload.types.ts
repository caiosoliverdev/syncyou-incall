/** Payload emitido para a app Tauri (namespace /oauth-bridge). */
export type OAuthSocketPayload =
  | {
      kind: 'tokens';
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { kind: 'signup'; signupToken: string }
  | {
      kind: 'disabled_confirm';
      reactivationToken: string;
    }
  | {
      kind: '2fa_required';
      tempToken: string;
    }
  | { kind: 'error'; code: string; message?: string };
