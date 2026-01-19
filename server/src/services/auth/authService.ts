import { findUserByUsername } from './userService';
import { verifyPassword } from './passwordService';
import { createSession } from './sessionService';

export interface LoginResult {
  success: boolean;
  user?: {
    id: number;
    username: string;
    role: 'admin' | 'user';
    created_at: Date;
    updated_at: Date;
  };
  session?: {
    token: string;
    expiresAt: Date;
  };
  error?: string;
}

const GENERIC_LOGIN_ERROR = 'Invalid username or password';

export async function login(username: string, password: string): Promise<LoginResult> {
  // Find user by username
  const user = await findUserByUsername(username);

  // User not found - return generic error (AC #5: don't reveal which field is wrong)
  if (!user) {
    return {
      success: false,
      error: GENERIC_LOGIN_ERROR,
    };
  }

  // Verify password using bcrypt (AC #1)
  const isPasswordValid = await verifyPassword(password, user.password_hash);

  if (!isPasswordValid) {
    return {
      success: false,
      error: GENERIC_LOGIN_ERROR,
    };
  }

  // Create session (AC #2)
  const session = await createSession(user.id);

  // Return user data without password_hash
  const { password_hash, ...safeUser } = user;

  return {
    success: true,
    user: safeUser,
    session,
  };
}
