import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import * as userService from '../services/auth/userService';

// Mock session service - must be before importing auth router
vi.mock('../services/auth/sessionService', () => ({
  validateSession: vi.fn(),
  isValidTokenFormat: vi.fn().mockReturnValue(true),
  isSlidingExpirationEnabled: vi.fn().mockReturnValue(false),
  refreshSession: vi.fn(),
}));

// Mock the user service
vi.mock('../services/auth/userService', () => ({
  createUser: vi.fn(),
  findUserByUsername: vi.fn(),
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { validateSession } from '../services/auth/sessionService';
import authRouter from './auth';

// Create test app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/auth', authRouter);

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: simulate admin session for register tests
    vi.mocked(validateSession).mockResolvedValue({
      session: {
        id: 1,
        user_id: 1,
        token: 'valid-admin-token',
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date(),
      },
      user: { id: 1, username: 'admin', role: 'admin' },
    });
  });

  describe('POST /api/v1/auth/register (admin-only)', () => {
    it('should register a new user successfully when admin', async () => {
      const newUser = { username: 'newuser', password: 'password123', role: 'user' };
      const createdUser = {
        id: 2,
        username: 'newuser',
        role: 'user' as const,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(userService.findUserByUsername).mockResolvedValue(null);
      vi.mocked(userService.createUser).mockResolvedValue(createdUser);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', 'session=valid-admin-token')
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.data.id).toBe(2);
      expect(response.body.data.username).toBe('newuser');
      expect(response.body.data.role).toBe('user');
      expect(userService.createUser).toHaveBeenCalledWith(expect.objectContaining({
        username: 'newuser',
        password: 'password123'
      }));
    });

    it('should return 400 for invalid data when admin', async () => {
      const invalidUser = { username: 'ab', password: '123' };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', 'session=valid-admin-token')
        .send(invalidUser);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 if username already exists when admin', async () => {
      const existingUser = { username: 'taken', password: 'password123' };

      vi.mocked(userService.findUserByUsername).mockResolvedValue({ id: 1, username: 'taken' } as any);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', 'session=valid-admin-token')
        .send(existingUser);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('USERNAME_EXISTS');
    });
  });
});
