import { db } from '../../db';
import { users, User } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from './passwordService';
import { RegisterUserInput } from '../../utils/validators';

export class DuplicateUsernameError extends Error {
  constructor(username: string) {
    super(`Username "${username}" already exists`);
    this.name = 'DuplicateUsernameError';
  }
}

export async function createUser(input: RegisterUserInput): Promise<Omit<User, 'password_hash'>> {
  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = await db.insert(users).values({
      username: input.username,
      password_hash: passwordHash,
      role: input.role || 'user',
    }).returning();

    const { password_hash, ...safeUser } = user;
    return safeUser;
  } catch (error: unknown) {
    // Handle SQLite unique constraint violation
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new DuplicateUsernameError(input.username);
    }
    throw error;
  }
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user || null;
}

export async function findUserById(id: number): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}
