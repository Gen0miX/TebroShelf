import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log info messages with JSON format', () => {
    logger.info('Test message', { context: 'test' });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"level":"info"')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Test message"')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"context":"test"')
    );
  });

  it('should log debug messages', () => {
    logger.debug('Debug message');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"level":"debug"')
    );
  });

  it('should log warn messages to console.warn', () => {
    logger.warn('Warning message');

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"level":"warn"')
    );
  });

  it('should log error messages to console.error', () => {
    logger.error('Error message');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"level":"error"')
    );
  });

  it('should include timestamp in ISO format', () => {
    logger.info('Test');

    const call = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should include additional metadata', () => {
    logger.info('User action', { userId: 123, action: 'login' });

    const call = (console.log as any).mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.userId).toBe(123);
    expect(parsed.action).toBe('login');
  });
});
