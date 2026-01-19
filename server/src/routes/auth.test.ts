import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import * as userService from '../services/auth/userService';

// Mock the user service
vi.mock('../services/auth/userService', () => ({
  createUser: vi.fn(),
  findUserByUsername: vi.fn(),
}));

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = { username: 'newuser', password: 'password123', role: 'user' };
      const createdUser = { id: 1, username: 'newuser', role: 'user' };

      (userService.createUser as any).mockResolvedValue(createdUser);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(createdUser);
      expect(userService.createUser).toHaveBeenCalledWith(expect.objectContaining({
        username: 'newuser',
        password: 'password123'
      }));
    });

    it('should return 400 for invalid data', async () => {
      const invalidUser = { username: 'ab', password: '123' };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidUser);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 if username already exists', async () => {
      const existingUser = { username: 'taken', password: 'password123' };
      
      // Simulate duplicate username error (or handle it via findUserByUsername)
      // Our implementation will likely check findUserByUsername first
      (userService.findUserByUsername as any).mockResolvedValue({ id: 1, username: 'taken' });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(existingUser);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('USERNAME_EXISTS');
    });
  });
});
