import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import type { UserRole } from '../db/schema';

/**
 * Middleware that requires admin role (AC #1, #3, #5)
 * Must be used after requireAuth middleware in the chain
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  if (req.user.role !== 'admin') {
    // AC #2: Log unauthorized access with user details
    logger.warn('Access denied', {
      event: 'access_denied',
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      endpoint: req.originalUrl,
      method: req.method,
    });

    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
  }

  next();
}

/**
 * Factory function for flexible role requirements (Task 2)
 * Allows specifying multiple allowed roles
 * Example: requireRole('admin', 'moderator')
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // AC #2: Log access denial with required roles
      logger.warn('Access denied', {
        event: 'access_denied',
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl,
        method: req.method,
      });

      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
}
