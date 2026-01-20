import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireAdmin, requireRole } from './roleGuard';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../utils/logger';

describe('roleGuard middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      user: undefined,
      originalUrl: '/api/v1/admin/users',
      method: 'GET',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('requireAdmin', () => {
    // AC #4: Unauthenticated user receives 401
    it('should return 401 if user is not authenticated', () => {
      mockReq.user = undefined;

      requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    // AC #1: Regular user receives 403
    it('should return 403 if user is not admin', () => {
      mockReq.user = { id: 2, username: 'sophie', role: 'user' };

      requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    // AC #2: Access denial is logged
    it('should log unauthorized access attempt with user details', () => {
      mockReq.user = { id: 2, username: 'sophie', role: 'user' };
      mockReq.originalUrl = '/api/v1/admin/users';
      mockReq.method = 'GET';

      requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith('Access denied', {
        event: 'access_denied',
        userId: 2,
        username: 'sophie',
        role: 'user',
        endpoint: '/api/v1/admin/users',
        method: 'GET',
      });
    });

    // AC #3: Admin can access
    it('should call next() if user is admin', () => {
      mockReq.user = { id: 1, username: 'admin', role: 'admin' };

      requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    // AC #5: Middleware chain order - requireAdmin assumes requireAuth ran first
    // This is tested by checking behavior when req.user is undefined
    it('should handle missing user gracefully (requireAuth should run first)', () => {
      mockReq.user = undefined;

      requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole factory function', () => {
    // AC #1: Regular user blocked from admin-only route
    it('should return 403 if user role is not in allowed roles', () => {
      mockReq.user = { id: 2, username: 'sophie', role: 'user' };
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    // AC #3: Allowed role can access
    it('should call next() if user role is in allowed roles', () => {
      mockReq.user = { id: 1, username: 'admin', role: 'admin' };
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    // Multiple roles support
    it('should allow access for any of multiple specified roles', () => {
      mockReq.user = { id: 2, username: 'sophie', role: 'user' };
      const middleware = requireRole('admin', 'user');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 401 if user is not authenticated', () => {
      mockReq.user = undefined;
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    });

    // AC #2: Log access denial with required roles
    it('should log access denial with required roles info', () => {
      mockReq.user = { id: 2, username: 'sophie', role: 'user' };
      mockReq.originalUrl = '/api/v1/admin/settings';
      mockReq.method = 'POST';
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith('Access denied', {
        event: 'access_denied',
        userId: 2,
        username: 'sophie',
        role: 'user',
        requiredRoles: ['admin'],
        endpoint: '/api/v1/admin/settings',
        method: 'POST',
      });
    });
  });
});
