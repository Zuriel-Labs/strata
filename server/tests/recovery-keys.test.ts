// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/passwords';
import { hashRecoveryKey, verifyRecoveryKey } from '../src/auth/recovery-keys';

describe('recovery key hashing', () => {
  it('uses a versioned constant-time digest for high-entropy recovery keys', async () => {
    const rawKey = '9e0743517c53443996e19ac9c6738b02d246c16a89f64431ab942563f9b9ae25';
    const hash = hashRecoveryKey(rawKey);

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(verifyRecoveryKey(rawKey, hash)).resolves.toBe(true);
    await expect(verifyRecoveryKey(`${rawKey}0`, hash)).resolves.toBe(false);
    await expect(verifyRecoveryKey(rawKey, 'sha256:not-a-valid-digest')).resolves.toBe(false);
  });

  it('accepts legacy bcrypt hashes during rolling upgrades', async () => {
    const rawKey = 'legacy-recovery-key';
    const legacyHash = await hashPassword(rawKey);

    await expect(verifyRecoveryKey(rawKey, legacyHash)).resolves.toBe(true);
    await expect(verifyRecoveryKey('incorrect', legacyHash)).resolves.toBe(false);
  });
});
