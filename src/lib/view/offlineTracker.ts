/**
 * Temporary views: decides which streams to drop because they went offline.
 * A stream is only dropped after it was seen live and then stayed offline for
 * a grace period, so a stream you add while it's offline stays (hidden until
 * live), and a short reconnect doesn't close it.
 */
export class OfflineTracker {
  private seenLive = new Set<string>();
  private offlineSince = new Map<string, number>();

  constructor(public graceMs = 90_000) {}

  /** Feeds the current channels; returns the ones to drop now. */
  update(channels: string[], isLive: (login: string) => boolean, now = Date.now()): string[] {
    const drop: string[] = [];
    for (const login of channels) {
      if (isLive(login)) {
        this.seenLive.add(login);
        this.offlineSince.delete(login);
        continue;
      }
      if (!this.seenLive.has(login)) continue;
      const since = this.offlineSince.get(login) ?? now;
      this.offlineSince.set(login, since);
      if (now - since >= this.graceMs) drop.push(login);
    }
    // Forget channels that left the view.
    for (const login of [...this.seenLive]) if (!channels.includes(login)) this.forget(login);
    drop.forEach((login) => this.forget(login));
    return drop;
  }

  forget(login: string): void {
    this.seenLive.delete(login);
    this.offlineSince.delete(login);
  }
}
