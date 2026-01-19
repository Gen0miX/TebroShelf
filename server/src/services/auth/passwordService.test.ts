import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './passwordService';

describe('Password Service', () => {
  it('should hash a password', async () => {
    const password = 'password123';
    const hash = await hashPassword(password);
    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true); // Default bcrypt prefix
  });

  it('should verify a correct password', async () => {
    const password = 'password123';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const correctPassword = 'correctpassword';
    const wrongPassword = 'wrongpassword';
    const hash = await hashPassword(correctPassword);
    const isValid = await verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });
});
