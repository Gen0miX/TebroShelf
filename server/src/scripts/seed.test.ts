import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedAdmin } from './seed';
import { db } from '../db';
import * as userService from '../services/auth/userService';

// Mock dependencies
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('../services/auth/userService', () => ({
  createUser: vi.fn(),
}));

describe('Seed Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('seedAdmin', () => {
    it('should create admin when no admins exist', async () => {
      // Mock: no admins found
      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      (userService.createUser as any).mockResolvedValue({
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      await seedAdmin();

      expect(userService.createUser).toHaveBeenCalledWith({
        username: 'admin',
        password: expect.any(String),
        role: 'admin',
      });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Creating default admin'));
    });

    it('should skip seeding when admin already exists', async () => {
      // Mock: admin already exists
      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, username: 'admin', role: 'admin' }]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      await seedAdmin();

      expect(userService.createUser).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Admin user already exists'));
    });

    it('should use ADMIN_DEFAULT_PASSWORD env var when set', async () => {
      const originalEnv = process.env.ADMIN_DEFAULT_PASSWORD;
      process.env.ADMIN_DEFAULT_PASSWORD = 'custom_secure_pass';

      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      (userService.createUser as any).mockResolvedValue({
        id: 1,
        username: 'admin',
        role: 'admin',
      });

      await seedAdmin();

      expect(userService.createUser).toHaveBeenCalledWith({
        username: 'admin',
        password: 'custom_secure_pass',
        role: 'admin',
      });

      // Restore env
      if (originalEnv !== undefined) {
        process.env.ADMIN_DEFAULT_PASSWORD = originalEnv;
      } else {
        delete process.env.ADMIN_DEFAULT_PASSWORD;
      }
    });

    it('should handle errors gracefully', async () => {
      const fromMock = vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('DB connection failed')),
      });
      (db.select as any).mockReturnValue({ from: fromMock });

      await seedAdmin();

      expect(console.error).toHaveBeenCalledWith(
        'Failed to seed admin user:',
        expect.any(Error)
      );
    });
  });
});
