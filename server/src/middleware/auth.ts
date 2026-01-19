import { Request, Response, NextFunction } from 'express';
import { validateSession, isValidTokenFormat } from '../services/auth/sessionService';

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
    res.clearCookie('session');
    return res.status(401).json({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session expired or invalid',
      },
    });
  }

  const sessionData = await validateSession(token);

  if (!sessionData) {
    res.clearCookie('session');
    return res.status(401).json({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session expired or invalid',
      },
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
