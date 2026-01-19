import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import * as sessionService from '../services/auth/sessionService';

vi.mock('../services/auth/sessionService');

describe('Auth Routes - Logout (Story 1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock isValidTokenFormat to return true for valid hex tokens by default
    vi.mocked(sessionService.isValidTokenFormat).mockImplementation((token: string) => {
      return /^[a-f0-9]{64}$/.test(token);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/auth/logout', () => {
    const validToken = 'a'.repeat(64);

    it('should return 200 and clear session cookie on successful logout (AC #1, #2)', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);
      vi.mocked(sessionService.deleteSession).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${validToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.message).toBe('Logged out successfully');

      // Check session cookie is cleared
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = (cookies as unknown as string[]).find((c: string) => c.startsWith('session='));
      expect(sessionCookie).toBeDefined();
      // Cookie should be cleared (empty value or expired)
      expect(sessionCookie).toMatch(/session=;|Expires=Thu, 01 Jan 1970/);
    });

    it('should call deleteSession with the token from cookie (AC #1)', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue({
        session: { id: 1, user_id: 1, token: validToken, expires_at: new Date(), created_at: new Date() },
        user: { id: 1, username: 'testuser', role: 'user' },
      });
      vi.mocked(sessionService.deleteSession).mockResolvedValue(undefined);

      await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${validToken}`)
        .expect(200);

      expect(sessionService.deleteSession).toHaveBeenCalledWith(validToken);
    });

    it('should return 200 even if no session cookie is provided - idempotent (AC #2)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body.data.message).toBe('Logged out successfully');
      expect(sessionService.deleteSession).not.toHaveBeenCalled();
    });

    it('should return 200 even if session does not exist in database - idempotent', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);
      vi.mocked(sessionService.deleteSession).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${validToken}`)
        .expect(200);

      expect(response.body.data.message).toBe('Logged out successfully');
    });

    it('should clear cookie with correct options (httpOnly, sameSite, path)', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);
      vi.mocked(sessionService.deleteSession).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${validToken}`)
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const sessionCookie = (cookies as unknown as string[]).find((c: string) => c.startsWith('session='));
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
      expect(sessionCookie).toContain('Path=/');
    });

    it('should return 500 when deleteSession throws an error', async () => {
      vi.mocked(sessionService.isValidTokenFormat).mockReturnValue(true);
      vi.mocked(sessionService.validateSession).mockResolvedValue({
        session: { id: 1, user_id: 1, token: validToken, expires_at: new Date(), created_at: new Date() },
        user: { id: 1, username: 'testuser', role: 'user' },
      });
      vi.mocked(sessionService.deleteSession).mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `session=${validToken}`)
        .expect(500);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(response.body.error.message).toBe('An unexpected error occurred');
    });

    it('should not call deleteSession for malformed token (defense in depth)', async () => {
      vi.mocked(sessionService.isValidTokenFormat).mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', 'session=malformed-token')
        .expect(200);

      expect(response.body.data.message).toBe('Logged out successfully');
      expect(sessionService.deleteSession).not.toHaveBeenCalled();
    });
  });
});
