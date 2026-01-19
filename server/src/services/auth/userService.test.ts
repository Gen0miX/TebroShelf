import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUser, findUserByUsername } from './userService';
import { db } from '../../db';
import { hashPassword } from './passwordService';

// Mock dependencies
vi.mock('../../db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('./passwordService', () => ({
  hashPassword: vi.fn(),
}));

describe('User Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user with hashed password and return safe user object', async () => {
      const mockInput = { username: 'testuser', password: 'password123', role: 'user' as const };
      const mockHash = 'hashed_password';
      const mockUser = {
        id: 1,
        username: mockInput.username,
        password_hash: mockHash,
        role: mockInput.role,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (hashPassword as any).mockResolvedValue(mockHash);
      
      const returningMock = vi.fn().mockResolvedValue([mockUser]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      (db.insert as any).mockReturnValue({ values: valuesMock });

      const result = await createUser(mockInput);

      expect(hashPassword).toHaveBeenCalledWith(mockInput.password);
      expect(db.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
        username: mockInput.username,
        password_hash: mockHash,
        role: mockInput.role,
      }));
      expect(result).not.toHaveProperty('password_hash');
      expect(result.username).toBe(mockInput.username);
    });
  });

  describe('findUserByUsername', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, username: 'found_user', role: 'user' };
      
      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockUser]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      const result = await findUserByUsername('found_user');
      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
       const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      const result = await findUserByUsername('unknown');
      expect(result).toBeNull();
    });
  });

  describe('findUserById', () => {
    it('should return user when found by id', async () => {
      const mockUser = { id: 42, username: 'found_user', role: 'user' };

      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([mockUser]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      const { findUserById } = await import('./userService.js');
      const result = await findUserById(42);
      expect(result).toEqual(mockUser);
    });

    it('should return null when id not found', async () => {
      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      const { findUserById } = await import('./userService.js');
      const result = await findUserById(999);
      expect(result).toBeNull();
    });
  });
});
