import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import * as sessionService from '../services/auth/sessionService';

vi.mock('../services/auth/sessionService');

describe('Auth Routes - /me Endpoint (Story 1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/auth/me', () => {
    const mockSessionData = {
      session: {
        id: 1,
        user_id: 1,
        token: 'a'.repeat(64),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_at: new Date(),
      },
      user: {
        id: 1,
        username: 'testuser',
        role: 'user' as const,
      },
    };

    it('should return 200 with user data when authenticated (AC #6)', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(mockSessionData);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${'a'.repeat(64)}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(1);
      expect(response.body.data.username).toBe('testuser');
      expect(response.body.data.role).toBe('user');
    });

    it('should return 401 when no session cookie is present (AC #6)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Authentication required');
    });

    it('should return 401 when session is expired or invalid', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${'b'.repeat(64)}`)
        .expect(401);

      expect(response.body.error.code).toBe('SESSION_EXPIRED');
      expect(response.body.error.message).toBe('Session expired or invalid');
    });

    it('should NOT include password_hash in response', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue(mockSessionData);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${'a'.repeat(64)}`)
        .expect(200);

      expect(response.body.data.password_hash).toBeUndefined();
      expect(response.body.data.password).toBeUndefined();
    });

    it('should be useful for frontend to check auth status on page load', async () => {
      // First call with valid session
      vi.mocked(sessionService.validateSession).mockResolvedValue(mockSessionData);

      const authResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `session=${'a'.repeat(64)}`)
        .expect(200);

      expect(authResponse.body.data).toBeDefined();

      // Second call without session
      vi.mocked(sessionService.validateSession).mockResolvedValue(null);

      const unauthResponse = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(unauthResponse.body.error).toBeDefined();
    });
  });
});
