import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';

// Mock session service
vi.mock('../services/auth/sessionService', () => ({
  validateSession: vi.fn(),
  isValidTokenFormat: vi.fn().mockReturnValue(true),
  isSlidingExpirationEnabled: vi.fn().mockReturnValue(false),
  refreshSession: vi.fn(),
}));

// Mock user service
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
import * as userService from '../services/auth/userService';
import authRouter from './auth';

// Create test app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/auth', authRouter);

describe('POST /api/v1/auth/register - Protected Route (Story 1.6, Task 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC #4: Unauthenticated user receives 401
  it('should return 401 for unauthenticated request', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'newuser', password: 'password123', role: 'user' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  // AC #1: Regular user receives 403
  it('should return 403 for non-admin user', async () => {
    vi.mocked(validateSession).mockResolvedValue({
      session: {
        id: 1,
        user_id: 2,
        token: 'valid-user-token',
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date(),
      },
      user: { id: 2, username: 'sophie', role: 'user' },
    });

    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', 'session=valid-user-token')
      .send({ username: 'newuser', password: 'password123', role: 'user' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  // AC #3: Admin can access
  it('should allow admin to register new user', async () => {
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

    vi.mocked(userService.findUserByUsername).mockResolvedValue(null);
    vi.mocked(userService.createUser).mockResolvedValue({
      id: 3,
      username: 'newuser',
      role: 'user' as const,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', 'session=valid-admin-token')
      .send({ username: 'newuser', password: 'password123', role: 'user' });

    expect(response.status).toBe(201);
    expect(response.body.data.username).toBe('newuser');
  });

  // AC #5: requireAuth runs before requireAdmin
  it('should check authentication before authorization', async () => {
    // No cookie = no authentication check passes first
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'test', password: 'test1234', role: 'user' });

    // Should get 401 (not 403), proving auth check runs first
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
