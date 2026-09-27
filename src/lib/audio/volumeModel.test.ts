import { describe, expect, it } from 'vitest';
import {
  setHeardVolume,
  setMasterVolume,
  setMixVolume,
  streamVolume,
  type VolumeModel,
} from './volumeModel';

const model = (patch: Partial<VolumeModel> = {}): VolumeModel => ({
  consistent: false,
  master: 0.5,
  volumes: {},
  balance: {},
  ...patch,
});

describe('per-channel volume', () => {
  it('uses each channel’s remembered volume, or none yet', () => {
    const m = model({ volumes: { loud: 0.2, quiet: 0.9 } });
    expect(streamVolume(m, 'loud')).toBe(0.2);
    expect(streamVolume(m, 'quiet')).toBe(0.9);
    expect(streamVolume(m, 'new')).toBeNull();
  });
  it('changes only that channel, from anywhere', () => {
    const m = model({ volumes: { a: 0.2 } });
    expect(setHeardVolume(m, 'b', 0.7)).toEqual({ volumes: { a: 0.2, b: 0.7 } });
    expect(setMixVolume(m, 'a', 1.4)).toEqual({ volumes: { a: 1 } });
  });
});

describe('consistent volume', () => {
  it('plays every stream at the master volume', () => {
    const m = model({ consistent: true, master: 0.6, volumes: { loud: 0.2 } });
    expect(streamVolume(m, 'loud')).toBe(0.6);
    expect(streamVolume(m, 'other')).toBe(0.6);
  });
  it('lets the mixer balance one stream against the rest', () => {
    const m = model({ consistent: true, master: 0.5 });
    const patch = setMixVolume(m, 'loud', 0.25);
    expect(patch).toEqual({ balance: { loud: 0.5 } });
    const next = { ...m, ...patch };
    expect(streamVolume(next, 'loud')).toBe(0.25);
    // Raising the master keeps the balance.
    expect(streamVolume({ ...next, ...setMasterVolume(0.8) }, 'loud')).toBe(0.4);
  });
  it('turning a stream up or down moves the master volume', () => {
    const m = model({ consistent: true, master: 0.5, balance: { loud: 0.5 } });
    expect(setHeardVolume(m, 'other', 0.7)).toEqual({ master: 0.7 });
    // Hearing the balanced stream at 0.3 means the master is 0.6.
    expect(setHeardVolume(m, 'loud', 0.3)).toEqual({ master: 0.6 });
  });
  it('never goes above 100% and survives zeros', () => {
    const m = model({ consistent: true, master: 0.8, balance: { quiet: 2 } });
    expect(streamVolume(m, 'quiet')).toBe(1);
    expect(setMixVolume({ ...m, master: 0 }, 'x', 0.5)).toEqual({});
    expect(setHeardVolume({ ...m, balance: { x: 0 } }, 'x', 0.5)).toEqual({});
    expect(setMasterVolume(3)).toEqual({ master: 1 });
  });
});
