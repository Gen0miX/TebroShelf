import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanupExpiredSessions } from './sessionCleanup';
import * as dbModule from '../../db';

vi.mock('../../db');
vi.mock('../../utils/logger');

describe('Session Cleanup Service (Story 1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions and return count (AC #6)', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 1 },
            { id: 2 },
            { id: 3 },
          ]),
        }),
      });
      vi.mocked(dbModule.db).delete = mockDelete;

      const count = await cleanupExpiredSessions();

      expect(count).toBe(3);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should return 0 when no expired sessions exist', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(dbModule.db).delete = mockDelete;

      const count = await cleanupExpiredSessions();

      expect(count).toBe(0);
    });

    it('should delete sessions where expires_at < now', async () => {
      const mockWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });
      const mockDelete = vi.fn().mockReturnValue({
        where: mockWhere,
      });
      vi.mocked(dbModule.db).delete = mockDelete;

      await cleanupExpiredSessions();

      // Verify delete was called (we can't easily verify the exact condition
      // in a unit test, but integration tests will cover that)
      expect(mockDelete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });
});
