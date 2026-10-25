/** Shared debounce for OS wake, unlock, reconnect and scheduler-gap signals. */
export class WakeSignals {
  private lastTick: number;
  private lastRecovery = -Infinity;
  pending = false;
  constructor(private readonly now: () => number = Date.now) {
    this.lastTick = now();
  }
  tick(): boolean {
    const now = this.now();
    const gap = now - this.lastTick;
    this.lastTick = now;
    return gap >= 30_000;
  }
  recover(available: boolean): boolean {
    if (!available) {
      this.pending = true;
      return false;
    }
    if (this.now() - this.lastRecovery < 5000) return false;
    this.lastRecovery = this.now();
    this.pending = false;
    return true;
  }
}
