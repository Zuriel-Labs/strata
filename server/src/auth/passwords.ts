import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function validatePassword(nextPassword: string) {
  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
}

export function generateTemporaryPassword() {
  return `Tmp-${randomBytes(6).toString('base64url')}1!`;
}
