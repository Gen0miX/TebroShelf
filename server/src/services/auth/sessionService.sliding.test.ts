import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshSession, isSlidingExpirationEnabled } from './sessionService';
import * as dbModule from '../../db';

vi.mock('../../db');

describe('Session Service - Sliding Expiration (Story 1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    delete process.env.SLIDING_EXPIRATION;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SLIDING_EXPIRATION;
  });

  describe('isSlidingExpirationEnabled', () => {
    it('should return false by default (Task 5.3)', () => {
      expect(isSlidingExpirationEnabled()).toBe(false);
    });

    it('should return true when SLIDING_EXPIRATION=true', () => {
      process.env.SLIDING_EXPIRATION = 'true';
      expect(isSlidingExpirationEnabled()).toBe(true);
    });

    it('should return false for other values', () => {
      process.env.SLIDING_EXPIRATION = 'false';
      expect(isSlidingExpirationEnabled()).toBe(false);

      process.env.SLIDING_EXPIRATION = 'yes';
      expect(isSlidingExpirationEnabled()).toBe(false);
    });
  });

  describe('refreshSession', () => {
    it('should update expires_at for the session (Task 5.2)', async () => {
      const mockWhere = vi.fn().mockResolvedValue({ rowsAffected: 1 });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
      vi.mocked(dbModule.db).update = mockUpdate;

      await refreshSession('a'.repeat(64));

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        expires_at: expect.any(Date),
      }));
    });
  });
});
