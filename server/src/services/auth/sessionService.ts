import crypto from "crypto";
import { db } from "../../db";
import { sessions, users } from "../../db/schema";
import { eq, and, gt } from "drizzle-orm";

const DEFAULT_SESSION_EXPIRY_DAYS = 7;
const TOKEN_BYTES = 32;
const TOKEN_HEX_LENGTH = TOKEN_BYTES * 2; // 64 hex characters

export function getSessionExpiryDays(): number {
  const envValue = process.env.SESSION_EXPIRY_DAYS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_SESSION_EXPIRY_DAYS;
}

export function generateSecureToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

export function calculateExpiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function isValidTokenFormat(token: string): boolean {
  const regex = new RegExp(`^[a-f0-9]{${TOKEN_HEX_LENGTH}}$`);
  return regex.test(token);
}

export interface SessionWithUser {
  session: {
    id: number;
    user_id: number;
    token: string;
    expires_at: Date;
    created_at: Date;
  };
  user: {
    id: number;
    username: string;
    role: "admin" | "user";
  };
}

export async function createSession(
  userId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSecureToken();
  const expiresAt = calculateExpiryDate(getSessionExpiryDays());

  await db.insert(sessions).values({
    user_id: userId,
    token,
    expires_at: expiresAt,
  });

  return { token, expiresAt };
}

export async function validateSession(
  token: string,
): Promise<SessionWithUser | null> {
  if (!isValidTokenFormat(token)) {
    return null;
  }

  const result = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        username: users.username,
        role: users.role,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expires_at, new Date())))
    .limit(1);

  return result[0] || null;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function deleteUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.user_id, userId));
}

/**
 * Check if sliding expiration is enabled (Task 5.3).
 * Disabled by default.
 */
export function isSlidingExpirationEnabled(): boolean {
  return process.env.SLIDING_EXPIRATION === "true";
}

/**
 * Extend session expiry on activity (Task 5.1, 5.2).
 * Used for sliding expiration when enabled.
 */
export async function refreshSession(token: string): Promise<void> {
  const newExpiry = calculateExpiryDate(getSessionExpiryDays());

  await db
    .update(sessions)
    .set({ expires_at: newExpiry })
    .where(eq(sessions.token, token));
}
