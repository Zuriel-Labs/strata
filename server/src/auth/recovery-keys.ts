import { createHash, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from './passwords';

const SHA256_PREFIX = 'sha256:';

function digestRecoveryKey(recoveryKey: string) {
  return createHash('sha256').update(recoveryKey, 'utf8').digest();
}

export function hashRecoveryKey(recoveryKey: string) {
  return `${SHA256_PREFIX}${digestRecoveryKey(recoveryKey).toString('hex')}`;
}

export async function verifyRecoveryKey(recoveryKey: string, storedHash: string) {
  if (!storedHash.startsWith(SHA256_PREFIX)) {
    // Existing installations may still contain bcrypt recovery-key hashes.
    return verifyPassword(recoveryKey, storedHash);
  }

  const expectedHex = storedHash.slice(SHA256_PREFIX.length);
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const actual = digestRecoveryKey(recoveryKey);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
