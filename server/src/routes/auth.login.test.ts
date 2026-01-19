import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import * as authService from '../services/auth/authService';

vi.mock('../services/auth/authService');

describe('Auth Routes - Login (Story 1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/auth/login', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      role: 'user' as const,
      created_at: new Date('2026-01-19T10:00:00Z'),
      updated_at: new Date('2026-01-19T10:00:00Z'),
    };

    const mockSession = {
      token: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    it('should return 200 and set httpOnly cookie on successful login (AC #3)', async () => {
      vi.mocked(authService.login).mockResolvedValue({
        success: true,
        user: mockUser,
        session: mockSession,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'testuser', password: 'correctpassword' })
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(1);
      expect(response.body.data.username).toBe('testuser');
      expect(response.body.data.role).toBe('user');

      // Check cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = (cookies as unknown as string[]).find((c: string) => c.startsWith('session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
      expect(sessionCookie).toContain('Path=/');
    });

    it('should return 401 with generic message on invalid credentials (AC #5)', async () => {
      vi.mocked(authService.login).mockResolvedValue({
        success: false,
        error: 'Invalid username or password',
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' })
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid username or password');
    });

    it('should return same 401 error for non-existent user (AC #5)', async () => {
      vi.mocked(authService.login).mockResolvedValue({
        success: false,
        error: 'Invalid username or password',
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent', password: 'anypassword' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid username or password');
    });

    it('should return 400 for missing username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: 'somepassword' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'testuser' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty request body', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should NOT include password in response', async () => {
      vi.mocked(authService.login).mockResolvedValue({
        success: true,
        user: mockUser,
        session: mockSession,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'testuser', password: 'correctpassword' })
        .expect(200);

      expect(response.body.data.password).toBeUndefined();
      expect(response.body.data.password_hash).toBeUndefined();
    });
  });
});
