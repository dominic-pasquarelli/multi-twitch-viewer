import type { PlayerPlaybackStats, PlayerStatus } from '@/lib/player/types';
import {
  interactedRecently,
  interactionVersion,
  playerHasFocus,
  setIntentionalPause,
} from './playerInteraction';

export interface RecoverySample {
  login: string;
  focused: boolean;
  muted: boolean;
  hidden: boolean;
  status?: PlayerStatus;
  stats?: PlayerPlaybackStats | null;
}

type Hold = 'manual' | 'group' | 'bandwidth';

export interface RecoveryPlan {
  degraded: boolean;
  pause: string[];
  resume: string[];
  pausedForBandwidth: string[];
}

/**
 * Recovery owns temporary holds independently of manual pauses. Quality is
 * restored only after a quiet period and streams restart one at a time, so
 * recovering a connection does not immediately overload it again.
 */
export class PlaybackRecovery {
  private holds = new Map<string, Set<Hold>>();
  private stalledSince = new Map<string, number>();
  private unexpectedPauses: number[] = [];
  private lastPressureAt = -Infinity;
  private lastResumeAt = -Infinity;
  private degraded = false;
  private bandwidthSaving = true;
  private manualPauseInteraction = new Map<string, { version: number; time: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private addHold(login: string, reason: Hold) {
    let reasons = this.holds.get(login);
    if (!reasons) this.holds.set(login, (reasons = new Set()));
    reasons.add(reason);
  }

  private release(login: string, reason: Hold) {
    const reasons = this.holds.get(login);
    reasons?.delete(reason);
    if (!reasons?.size) this.holds.delete(login);
  }

  isManagedPause(login: string): boolean {
    return Boolean(this.holds.get(login)?.size);
  }

  /** Used by Play all to honor a tab switch before the next recovery tick. */
  setGroupHidden(login: string, hidden: boolean) {
    if (hidden) this.addHold(login, 'group');
    else this.release(login, 'group');
  }

  pauseManually(login: string) {
    this.addHold(login, 'manual');
    this.manualPauseInteraction.set(login, {
      version: interactionVersion(login),
      time: this.now(),
    });
    setIntentionalPause(login, true);
  }

  allowManualPlay(login: string) {
    this.release(login, 'manual');
    this.manualPauseInteraction.delete(login);
    setIntentionalPause(login, false);
  }

  observeStatus(login: string, status: PlayerStatus, userPause: boolean) {
    const manual = this.manualPauseInteraction.get(login);
    // The interaction which paused a stream cannot also authorize an autoplay
    // after its iframe remounts. A new click, or play inside the focused iframe,
    // does authorize it.
    const userPlayed =
      manual &&
      ((interactionVersion(login) > manual.version &&
        interactedRecently(login, 3000, this.now())) ||
        (playerHasFocus(login) && this.now() - manual.time >= 300));
    if (status === 'playing' && userPlayed) {
      this.allowManualPlay(login);
    }
    if (status !== 'paused' || this.isManagedPause(login)) return;
    if (userPause) {
      this.pauseManually(login);
      return;
    }
    if (!this.bandwidthSaving) return;
    const now = this.now();
    this.unexpectedPauses = this.unexpectedPauses.filter((t) => now - t < 15_000);
    this.unexpectedPauses.push(now);
    if (this.unexpectedPauses.length >= 2) this.pressure(now);
  }

  private pressure(now: number) {
    this.degraded = true;
    this.lastPressureAt = now;
  }

  forget(login: string) {
    this.holds.delete(login);
    this.manualPauseInteraction.delete(login);
    this.stalledSince.delete(login);
    setIntentionalPause(login, false);
  }

  plan(
    samples: readonly RecoverySample[],
    online = true,
    bandwidthSaving = this.bandwidthSaving,
  ): RecoveryPlan {
    this.bandwidthSaving = bandwidthSaving;
    if (!bandwidthSaving) {
      this.degraded = false;
      this.stalledSince.clear();
      this.unexpectedPauses = [];
      this.lastPressureAt = -Infinity;
      this.lastResumeAt = -Infinity;
    }
    const now = this.now();
    const logins = new Set(samples.map((sample) => sample.login));
    for (const login of this.holds.keys()) if (!logins.has(login)) this.forget(login);
    for (const login of this.stalledSince.keys())
      if (!logins.has(login)) this.stalledSince.delete(login);
    const resume = new Set<string>();

    for (const sample of samples) {
      const { login, hidden, status, stats } = sample;
      if (hidden) this.addHold(login, 'group');
      else if (this.holds.get(login)?.has('group')) {
        this.release(login, 'group');
        if (!this.isManagedPause(login)) resume.add(login);
      }
      if (!bandwidthSaving) {
        if (this.holds.get(login)?.has('bandwidth')) {
          this.release(login, 'bandwidth');
          if (!hidden && !this.isManagedPause(login)) resume.add(login);
        }
        continue;
      }
      // Low buffers alone are normal for low-latency streams. Require both
      // buffer starvation and a stopped frame rate for several samples.
      const starving =
        !hidden &&
        !this.isManagedPause(login) &&
        status === 'playing' &&
        typeof stats?.bufferSize === 'number' &&
        stats.bufferSize <= 0.5 &&
        typeof stats.fps === 'number' &&
        stats.fps <= 1;
      if (starving) {
        if (!this.stalledSince.has(login)) this.stalledSince.set(login, now);
        if (now - this.stalledSince.get(login)! >= 6_000) this.pressure(now);
      } else this.stalledSince.delete(login);
    }
    if (bandwidthSaving && !online) this.pressure(now);

    if (this.degraded) {
      for (const sample of samples) {
        const reasons = this.holds.get(sample.login);
        // A newly focused or audible stream must not remain network-paused.
        if ((!sample.muted || sample.focused) && reasons?.has('bandwidth')) {
          this.release(sample.login, 'bandwidth');
          if (!this.isManagedPause(sample.login)) resume.add(sample.login);
        }
        if (
          now - this.lastPressureAt < 15_000 &&
          sample.muted &&
          !sample.focused &&
          !sample.hidden &&
          !reasons?.has('manual') &&
          sample.status === 'playing'
        ) {
          this.addHold(sample.login, 'bandwidth');
        }
      }
      if (online && now - this.lastPressureAt >= 15_000) {
        for (const sample of samples) {
          const reasons = this.holds.get(sample.login);
          if (reasons?.has('bandwidth') && (reasons.has('manual') || reasons.has('group'))) {
            this.release(sample.login, 'bandwidth');
          }
        }
      }
      if (online && now - this.lastPressureAt >= 15_000 && now - this.lastResumeAt >= 8_000) {
        const candidate = samples.find((sample) => {
          const reasons = this.holds.get(sample.login);
          return reasons?.has('bandwidth') && !reasons.has('manual') && !reasons.has('group');
        });
        if (candidate) {
          this.release(candidate.login, 'bandwidth');
          resume.add(candidate.login);
          this.lastResumeAt = now;
        }
      }
      const hasBandwidthHolds = samples.some((sample) =>
        this.holds.get(sample.login)?.has('bandwidth'),
      );
      if (
        online &&
        !hasBandwidthHolds &&
        now - this.lastPressureAt >= 30_000 &&
        now - this.lastResumeAt >= 10_000
      )
        this.degraded = false;
    }

    return {
      degraded: this.degraded,
      pause: samples
        .filter(
          (sample) =>
            this.isManagedPause(sample.login) &&
            sample.status !== 'paused' &&
            sample.status !== 'offline' &&
            sample.status !== 'ended',
        )
        .map((sample) => sample.login),
      resume: [...resume].filter((login) => !this.isManagedPause(login)),
      pausedForBandwidth: samples
        .filter((sample) => this.holds.get(sample.login)?.has('bandwidth'))
        .map((sample) => sample.login),
    };
  }
}

export const playbackRecovery = new PlaybackRecovery();

/** Bounded reloads survive remounting the failed embed. */
export class PlayerReloadBudget {
  private attempts = new Map<string, number[]>();
  constructor(private readonly now: () => number = Date.now) {}

  nextDelay(login: string): number | null {
    const now = this.now();
    const attempts = (this.attempts.get(login) ?? []).filter((time) => now - time < 5 * 60_000);
    if (attempts.length >= 3 || (attempts.length && now - attempts.at(-1)! < 15_000)) return null;
    const delay = [1000, 4000, 12_000][attempts.length]!;
    attempts.push(now);
    this.attempts.set(login, attempts);
    return delay;
  }
}
