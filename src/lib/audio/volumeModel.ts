/**
 * How loud each stream plays. Two ways to think about volume:
 *
 * - **Per channel** (default): every channel remembers its own volume, so a
 *   loud streamer stays tamed. Switching streams can change how loud it is.
 * - **Consistent**: one master volume for whatever you listen to, so
 *   switching streams keeps the same loudness. A per-channel balance
 *   (1 = same as master) still lets the mixer even out a loud or quiet one.
 *
 * Main stream priority (Mix + Focus): the main stream plays at one main
 * level (100% by default; of the master in consistent mode) instead of its
 * own, and setting its volume sets that level. The others keep theirs, so a
 * stream set to 20% plays at 100% while it's the main one and at 20% after.
 *
 * Pure functions; the stores hold the state.
 */
export interface VolumeModel {
  /** Optional fixed player levels in Mix; applied before the app output multiplier. */
  mix?: { priorities: readonly string[]; priorityLevel: number; backgroundLevel: number | null };
  /** Music has a separate level, unaffected by video focus or the consistent-volume master. */
  musicChannel?: string | null;
  musicVolume?: number;
  consistent: boolean;
  /** Consistent mode: the volume you hear (0–1). */
  master: number;
  /** Per-channel mode: each channel's volume (0–1). */
  volumes: Record<string, number>;
  /** Consistent mode: each channel's level relative to master (1 = same). */
  balance: Record<string, number>;
  /** The main stream while main stream priority applies, else null. */
  priorityMain?: string | null;
  /** The level the priority main stream plays at (0–1, default 1). */
  mainLevel?: number;
}

export type VolumePatch = Partial<
  Pick<VolumeModel, 'master' | 'volumes' | 'balance' | 'mainLevel'>
>;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The volume a stream plays at when heard in full (before ducking).
 * null = no preference yet: leave the player's own volume.
 */
export function streamVolume(m: VolumeModel, login: string): number | null {
  if (m.musicChannel === login) return m.musicVolume ?? 0.35;
  const fixed = fixedMixRole(m, login);
  if (fixed === 'priority') return m.mix!.priorityLevel;
  if (fixed === 'background') return m.mix!.backgroundLevel!;
  const main = isPriorityMain(m, login);
  if (m.consistent)
    return round2(clamp(m.master * (main ? mainLevel(m) : (m.balance[login] ?? 1)), 0, 1));
  return main ? mainLevel(m) : (m.volumes[login] ?? null);
}

export function fixedMixRole(
  m: VolumeModel,
  login: string,
): 'music' | 'priority' | 'background' | null {
  if (m.musicChannel === login) return 'music';
  if (m.mix?.priorities.includes(login)) return 'priority';
  return m.mix && m.mix.backgroundLevel !== null ? 'background' : null;
}

const isPriorityMain = (m: VolumeModel, login: string) =>
  !!m.priorityMain && m.priorityMain === login;
const mainLevel = (m: VolumeModel) => m.mainLevel ?? 1;

/**
 * "I want to hear this stream at `volume`" (arrow keys, top-bar slider, the
 * player's own slider). Consistent mode moves the master volume, so every
 * stream follows.
 */
export function setHeardVolume(m: VolumeModel, login: string, volume: number): VolumePatch {
  const v = clamp(volume, 0, 1);
  const main = isPriorityMain(m, login);
  if (!m.consistent)
    return main ? { mainLevel: round2(v) } : { volumes: { ...m.volumes, [login]: round2(v) } };
  const balance = main ? mainLevel(m) : (m.balance[login] ?? 1);
  if (balance <= 0) return {};
  return { master: round2(clamp(v / balance, 0, 1)) };
}

/**
 * "This stream should sit at `volume` in the mix" (a mixer row). Consistent
 * mode changes only this stream's balance against the master volume.
 */
export function setMixVolume(m: VolumeModel, login: string, volume: number): VolumePatch {
  const v = clamp(volume, 0, 1);
  const main = isPriorityMain(m, login);
  if (!m.consistent)
    return main ? { mainLevel: round2(v) } : { volumes: { ...m.volumes, [login]: round2(v) } };
  if (m.master <= 0) return {};
  return main
    ? { mainLevel: round2(clamp(v / m.master, 0, 1)) }
    : { balance: { ...m.balance, [login]: round2(v / m.master) } };
}

/** Consistent mode: raise or lower the master volume. */
export function setMasterVolume(volume: number): VolumePatch {
  return { master: round2(clamp(volume, 0, 1)) };
}
