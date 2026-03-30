import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generateKeyPairSync } from 'crypto';

const PRIVATE_NAME = 'jwt-rsa-private.pem';
const PUBLIC_NAME = 'jwt-rsa-public.pem';

export interface JwtRsaKeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Garante um par RSA PEM em `keysDir`. Se os ficheiros não existirem, gera e grava.
 */
export function ensureJwtRsaKeys(keysDir: string): JwtRsaKeyPair {
  const privatePath = join(keysDir, PRIVATE_NAME);
  const publicPath = join(keysDir, PUBLIC_NAME);

  if (!existsSync(keysDir)) {
    mkdirSync(keysDir, { recursive: true });
  }

  if (!existsSync(privatePath) || !existsSync(publicPath)) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    writeFileSync(privatePath, privateKey, { mode: 0o600 });
    writeFileSync(publicPath, publicKey, { mode: 0o644 });
  }

  return {
    privateKey: readFileSync(privatePath, 'utf8'),
    publicKey: readFileSync(publicPath, 'utf8'),
  };
}
