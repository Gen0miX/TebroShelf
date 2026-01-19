import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export class PasswordHashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordHashError';
  }
}

export async function hashPassword(plainText: string): Promise<string> {
  try {
    return await bcrypt.hash(plainText, SALT_ROUNDS);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown bcrypt error';
    throw new PasswordHashError(`Failed to hash password: ${message}`);
  }
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plainText, hash);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown bcrypt error';
    throw new PasswordHashError(`Failed to verify password: ${message}`);
  }
}
