import { logger } from "./logger";

interface RateLimiterOptions {
  maxTokens: number;
  refillIntervalMs: number;
}

const context = "rateLimiter";

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillIntervalMs: number;
  private lastRefill: number;

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxTokens;
    this.tokens = options.maxTokens;
    this.refillIntervalMs = options.refillIntervalMs;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a token, waiting if necessary
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Calculate wait time until next refill
    const elapsed = Date.now() - this.lastRefill;
    const waitTime = this.refillIntervalMs - elapsed;

    if (waitTime > 0) {
      logger.warn("Rate limit reached, waiting", {
        context,
        waitMs: waitTime,
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refill();
    }
    this.tokens--;
  }

  /**
   * Try to acquire a token without waiting.
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  /**
   * Get remaining tokens.
   */
  getRemaining(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.refillIntervalMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}
