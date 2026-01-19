import { Request, Response, NextFunction } from 'express';
import { validateSession, isValidTokenFormat, isSlidingExpirationEnabled, refreshSession } from '../services/auth/sessionService';

// Extend Express Request type for user context (AC #6)
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: 'admin' | 'user';
      };
      sessionToken?: string;
    }
  }
}

/**
 * Middleware that requires authentication via session cookie (AC #6)
 * Extracts session token from cookie, validates it, and attaches user to request
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  // Fast-fail for malformed tokens before DB query
  if (!isValidTokenFormat(token)) {
    res.clearCookie('session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res.status(401).json({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session expired. Please log in again.',
      },
    });
  }

  const sessionData = await validateSession(token);

  if (!sessionData) {
    // Clear invalid/expired cookie (AC #4, #5 from Story 1.5)
    res.clearCookie('session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res.status(401).json({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session expired. Please log in again.',
      },
    });
  }

  // Sliding expiration: extend session on activity (Task 5.1, 5.2)
  // Token format already validated above via isValidTokenFormat check
  if (isSlidingExpirationEnabled()) {
    // Fire-and-forget - don't block the request for refresh
    // Note: Under high load, consider adding rate limiting or debouncing
    // to prevent excessive DB writes (e.g., refresh max once per minute)
    refreshSession(token).catch(() => {
      // Silently ignore refresh errors - session is still valid
    });
  }

  // Attach user to request for downstream handlers
  req.user = sessionData.user;
  req.sessionToken = token;
  next();
}

/**
 * Placeholder for admin-only protection.
 * In Story 1.3, this is a pass-through to allow initial registration.
 * Full implementation will follow in Story 1.6.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement actual session/JWT check and role verification in Story 1.6
  // For now, allow all requests
  next();
};
