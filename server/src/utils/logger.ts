/**
 * Structured logger for consistent logging across the application.
 * Outputs JSON format for easy parsing by log aggregation tools.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (key === 'error' && value instanceof Error) {
        entry.error = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      } else {
        entry[key] = value;
      }
    }
  }

  return entry;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry = formatLog(level, message, meta);
  const output = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
