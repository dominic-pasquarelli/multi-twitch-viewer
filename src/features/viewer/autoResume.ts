/**
 * Decides whether to restart a stream that paused. Pauses you make yourself
 * are respected; others (e.g. the player pausing on its own) are undone, but
 * never more than `maxRetries` times a minute, to avoid fighting a player
 * that keeps pausing.
 */
export class AutoResume {
  private attempts: number[] = [];
  private readonly maxRetries: number;
  private readonly now: () => number;

  constructor(maxRetries = 3, now: () => number = Date.now) {
    this.maxRetries = maxRetries;
    this.now = now;
  }

  shouldResume(pausedByUser: boolean): boolean {
    if (pausedByUser) return false;
    const t = this.now();
    this.attempts = this.attempts.filter((a) => t - a < 60_000);
    if (this.attempts.length >= this.maxRetries) return false;
    this.attempts.push(t);
    return true;
  }
}
