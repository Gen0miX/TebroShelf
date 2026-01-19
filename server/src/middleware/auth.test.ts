import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';
import * as sessionService from '../services/auth/sessionService';

vi.mock('../services/auth/sessionService');

describe('Auth Middleware (Story 1.4)', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock isValidTokenFormat to return true for valid hex tokens
    vi.mocked(sessionService.isValidTokenFormat).mockImplementation((token: string) => {
      return /^[a-f0-9]{64}$/.test(token);
    });
    mockRequest = {
      cookies: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requireAuth', () => {
    it('should call next() and attach user to request on valid session (AC #6)', async () => {
      const mockSessionData = {
        session: {
          id: 1,
          user_id: 1,
          token: 'a'.repeat(64),
          expires_at: new Date(Date.now() + 1000000),
          created_at: new Date(),
        },
        user: {
          id: 1,
          username: 'testuser',
          role: 'user' as const,
        },
      };

      mockRequest.cookies = { session: 'a'.repeat(64) };
      vi.mocked(sessionService.validateSession).mockResolvedValue(mockSessionData);

      await requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toEqual(mockSessionData.user);
      expect(mockRequest.sessionToken).toBe('a'.repeat(64));
    });

    it('should return 401 when no session cookie is present', async () => {
      mockRequest.cookies = {};

      await requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when session is expired or invalid (AC #4, #5)', async () => {
      mockRequest.cookies = { session: 'expired_token_here'.padEnd(64, '0') };
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      await requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session expired. Please log in again.',
        },
      });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('session', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should clear cookie with correct options on invalid session', async () => {
      mockRequest.cookies = { session: 'invalid_session'.padEnd(64, '0') };
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      await requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('session', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
    });

    it('should validate session using sessionService', async () => {
      const token = 'b'.repeat(64);
      mockRequest.cookies = { session: token };
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      await requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(sessionService.validateSession).toHaveBeenCalledWith(token);
    });
  });
});
