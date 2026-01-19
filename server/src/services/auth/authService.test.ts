import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as authService from './authService';
import * as userService from './userService';
import * as passwordService from './passwordService';
import * as sessionService from './sessionService';

// Mock dependencies
vi.mock('./userService');
vi.mock('./passwordService');
vi.mock('./sessionService');

describe('Auth Service (Story 1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      role: 'user' as const,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockSession = {
      token: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    it('should return success with user and session on valid credentials (AC #1)', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);
      vi.mocked(sessionService.createSession).mockResolvedValue(mockSession);

      const result = await authService.login('testuser', 'correctpassword');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.id).toBe(1);
      expect(result.user!.username).toBe('testuser');
      expect(result.user!.role).toBe('user');
      expect(result.session).toBeDefined();
      expect(result.session!.token).toBe(mockSession.token);
    });

    it('should verify password using bcrypt via passwordService (AC #1)', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);
      vi.mocked(sessionService.createSession).mockResolvedValue(mockSession);

      await authService.login('testuser', 'correctpassword');

      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        'correctpassword',
        mockUser.password_hash
      );
    });

    it('should return failure with generic error for invalid password (AC #5)', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(false);

      const result = await authService.login('testuser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid username or password');
      expect(result.user).toBeUndefined();
      expect(result.session).toBeUndefined();
    });

    it('should return failure with same generic error for non-existent user (AC #5)', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(null);

      const result = await authService.login('nonexistent', 'anypassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid username or password');
      // Should NOT reveal that user doesn't exist
      expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should create session on successful login (AC #2)', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);
      vi.mocked(sessionService.createSession).mockResolvedValue(mockSession);

      await authService.login('testuser', 'correctpassword');

      expect(sessionService.createSession).toHaveBeenCalledWith(mockUser.id);
    });

    it('should NOT create session on failed login', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(false);

      await authService.login('testuser', 'wrongpassword');

      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should NOT include password_hash in returned user data', async () => {
      vi.mocked(userService.findUserByUsername).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);
      vi.mocked(sessionService.createSession).mockResolvedValue(mockSession);

      const result = await authService.login('testuser', 'correctpassword');

      expect(result.user).toBeDefined();
      expect((result.user as any).password_hash).toBeUndefined();
    });
  });
});
