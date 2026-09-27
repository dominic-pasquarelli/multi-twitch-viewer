/**
 * How loud each stream plays. Two ways to think about volume:
 *
 * - **Per channel** (default): every channel remembers its own volume, so a
 *   loud streamer stays tamed. Switching streams can change how loud it is.
 * - **Consistent**: one master volume for whatever you listen to, so
 *   switching streams keeps the same loudness. A per-channel balance
 *   (1 = same as master) still lets the mixer even out a loud or quiet one.
 *
 * Pure functions; the stores hold the state.
 */
export interface VolumeModel {
  consistent: boolean;
  /** Consistent mode: the volume you hear (0–1). */
  master: number;
  /** Per-channel mode: each channel's volume (0–1). */
  volumes: Record<string, number>;
  /** Consistent mode: each channel's level relative to master (1 = same). */
  balance: Record<string, number>;
}

export type VolumePatch = Partial<Pick<VolumeModel, 'master' | 'volumes' | 'balance'>>;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The volume a stream plays at when heard in full (before ducking).
 * null = no preference yet: leave the player's own volume.
 */
export function streamVolume(m: VolumeModel, login: string): number | null {
  if (m.consistent) return round2(clamp(m.master * (m.balance[login] ?? 1), 0, 1));
  return m.volumes[login] ?? null;
}

/**
 * "I want to hear this stream at `volume`" (arrow keys, top-bar slider, the
 * player's own slider). Consistent mode moves the master volume, so every
 * stream follows.
 */
export function setHeardVolume(m: VolumeModel, login: string, volume: number): VolumePatch {
  const v = clamp(volume, 0, 1);
  if (!m.consistent) return { volumes: { ...m.volumes, [login]: round2(v) } };
  const balance = m.balance[login] ?? 1;
  if (balance <= 0) return {};
  return { master: round2(clamp(v / balance, 0, 1)) };
}

/**
 * "This stream should sit at `volume` in the mix" (a mixer row). Consistent
 * mode changes only this stream's balance against the master volume.
 */
export function setMixVolume(m: VolumeModel, login: string, volume: number): VolumePatch {
  const v = clamp(volume, 0, 1);
  if (!m.consistent) return { volumes: { ...m.volumes, [login]: round2(v) } };
  if (m.master <= 0) return {};
  return { balance: { ...m.balance, [login]: round2(v / m.master) } };
}

/** Consistent mode: raise or lower the master volume. */
export function setMasterVolume(volume: number): VolumePatch {
  return { master: round2(clamp(volume, 0, 1)) };
}
