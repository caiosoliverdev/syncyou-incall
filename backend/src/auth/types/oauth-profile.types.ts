export type OAuthProfilePayload = {
  provider: 'google' | 'microsoft';
  oauthSubject: string;
  email: string;
  firstName: string;
  lastName: string;
  picture: string | null;
};
