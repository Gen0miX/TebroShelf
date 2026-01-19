import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScheduler, stopScheduler, getSchedulerStatus } from './scheduler';
import * as sessionCleanup from '../services/auth/sessionCleanup';

vi.mock('../services/auth/sessionCleanup');
vi.mock('../utils/logger');

describe('Scheduler (Story 1.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopScheduler(); // Ensure clean state
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startScheduler', () => {
    it('should run cleanup on startup (AC #6 - Task 4.4)', async () => {
      vi.mocked(sessionCleanup.cleanupExpiredSessions).mockResolvedValue(5);

      startScheduler();

      // Allow async operations to complete
      await vi.advanceTimersByTimeAsync(0);

      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });

    it('should schedule periodic cleanup (AC #6 - Task 4.2)', async () => {
      vi.mocked(sessionCleanup.cleanupExpiredSessions).mockResolvedValue(0);

      startScheduler();

      // Initial call on startup
      await vi.advanceTimersByTimeAsync(0);
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(1);

      // Advance by 1 hour (default interval)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(2);

      // Advance by another hour
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(3);
    });

    it('should handle cleanup errors gracefully', async () => {
      vi.mocked(sessionCleanup.cleanupExpiredSessions).mockRejectedValue(new Error('DB error'));

      // Should not throw
      expect(() => startScheduler()).not.toThrow();

      await vi.advanceTimersByTimeAsync(0);

      // Should continue despite error
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalled();
    });

    it('should not start multiple schedulers', async () => {
      vi.mocked(sessionCleanup.cleanupExpiredSessions).mockResolvedValue(0);

      startScheduler();
      startScheduler(); // Second call should be ignored

      await vi.advanceTimersByTimeAsync(0);

      // Should only run once
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopScheduler', () => {
    it('should stop the scheduler', async () => {
      vi.mocked(sessionCleanup.cleanupExpiredSessions).mockResolvedValue(0);

      startScheduler();
      await vi.advanceTimersByTimeAsync(0);
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(1);

      stopScheduler();

      // Advance time - should not trigger more cleanups
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(sessionCleanup.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSchedulerStatus', () => {
    it('should return running status when scheduler is active', () => {
      vi.mocked(sessionCleanup.cleanupExpiredSessions).mockResolvedValue(0);

      startScheduler();

      const status = getSchedulerStatus();
      expect(status.running).toBe(true);
      expect(status.intervalMs).toBe(3600000); // Default 1 hour
    });

    it('should return not running when scheduler is stopped', () => {
      stopScheduler();

      const status = getSchedulerStatus();
      expect(status.running).toBe(false);
    });
  });
});
