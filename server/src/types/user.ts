import { z } from 'zod';
import type { User, NewUser, UserRole } from '../db/schema';

// Re-export types from schema
export type { User, NewUser, UserRole };

/**
 * Zod schema for user role validation
 */
export const userRoleSchema = z.enum(['admin', 'user']);

/**
 * Zod schema for creating a new user (before hashing password)
 * Note: 'password' field will be hashed to 'password_hash' before DB insert
 */
export const newUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: userRoleSchema.optional().default('user'),
});

/**
 * Zod schema for validating existing user data from database
 */
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  password_hash: z.string(),
  role: userRoleSchema,
  created_at: z.date(),
  updated_at: z.date(),
});
