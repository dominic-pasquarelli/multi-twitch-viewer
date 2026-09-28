import { describe, expect, it, vi } from 'vitest';
import { MockPlayer } from './mockPlayer';
import { PlayerController } from './PlayerController';
import { pickQuality, pickQualityForHeight } from './quality';

function setup(initial = { muted: true, volume: 0.4 as number | null, quality: null }) {
  let now = 0;
  const host = document.createElement('div');
  const player = new MockPlayer(host, 'abc', true, { readyDelay: 0 });
  const callbacks = { onStatus: vi.fn(), onExternalMute: vi.fn(), onExternalVolume: vi.fn() };
  const controller = new PlayerController(player, initial, callbacks, {
    graceMs: 1000,
    now: () => now,
  });
  return { player, controller, callbacks, advance: (ms: number) => (now += ms) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PlayerController', () => {
  it('applies the desired state once the player is ready', async () => {
    const { player, controller, callbacks } = setup({ muted: false, volume: 0.4, quality: null });
    expect(controller.isReady).toBe(false);
    await flush();
    expect(player.muted).toBe(false);
    expect(player.volume).toBe(0.4);
    expect(callbacks.onStatus).toHaveBeenCalledWith('playing');
    expect(player.quality).toBe('auto'); // untouched: setQuality was not called
  });

  it('only sends a quality change when one is requested', async () => {
    const { player, controller } = setup();
    await flush();
    const spy = vi.spyOn(player, 'setQuality');
    controller.update({ quality: '480p30' });
    controller.update({ quality: null });
    expect(spy.mock.calls).toEqual([['480p30'], ['auto']]);
  });

  it('pushes later updates straight to the player', async () => {
    const { player, controller } = setup();
    await flush();
    controller.update({ muted: false, volume: 0.9, quality: '720p60' });
    expect(player.muted).toBe(false);
    expect(player.volume).toBe(0.9);
    expect(player.quality).toBe('720p60');
  });

  it('reports mute/volume changes made with the player controls', async () => {
    const { player, controller, callbacks, advance } = setup();
    await flush();
    player.setMuted(false); // user clicked unmute inside the player
    player.setVolume(0.7);
    controller.sync(); // within grace period: ignored
    expect(callbacks.onExternalMute).not.toHaveBeenCalled();
    advance(2000);
    controller.sync();
    expect(callbacks.onExternalMute).toHaveBeenCalledWith(false);
    expect(callbacks.onExternalVolume).toHaveBeenCalledWith(0.7);
    callbacks.onExternalMute.mockClear();
    controller.sync();
    expect(callbacks.onExternalMute).not.toHaveBeenCalled();
  });

  it('adopts the player volume silently when none was requested', async () => {
    const { controller, callbacks, advance } = setup({ muted: true, volume: null, quality: null });
    await flush();
    advance(2000);
    controller.sync();
    expect(callbacks.onExternalVolume).toHaveBeenCalledWith(0.5);
  });
});

describe('pickQualityForHeight', () => {
  const q = [
    { group: 'auto', name: 'Auto', height: 0 },
    { group: 'chunked', name: '1080p60', height: 1080 },
    { group: '720p60', name: '720p60', height: 720 },
    { group: '480p30', name: '480p', height: 480 },
    { group: '160p30', name: '160p', height: 160 },
  ];
  it('picks the smallest quality covering the tile', () => {
    expect(pickQualityForHeight(q, 360)).toBe('480p30');
    expect(pickQualityForHeight(q, 540)).toBe('720p60');
    expect(pickQualityForHeight(q, 540, 2)).toBe('chunked');
    expect(pickQualityForHeight(q, 3000)).toBe('chunked');
  });
  it('never goes below 360p for tiny tiles', () => {
    expect(pickQualityForHeight(q, 120)).toBe('480p30'); // no 360p here: next one up
  });
  it('returns null without qualities', () => expect(pickQualityForHeight([], 300)).toBeNull());
});

describe('pickQuality', () => {
  const q = [
    { group: 'auto', name: 'Auto', height: 0 },
    { group: 'chunked', name: '1080p60', height: 1080 },
    { group: '720p60', name: '720p60', height: 720 },
    { group: '480p30', name: '480p', height: 480 },
    { group: '160p30', name: '160p', height: 160 },
  ];
  it('auto leaves it to Twitch, source takes the best', () => {
    expect(pickQuality(q, 'auto', 300)).toBeNull();
    expect(pickQuality(q, 'source', 100)).toBe('chunked');
  });
  it('fit matches the tile size', () => expect(pickQuality(q, 'fit', 700)).toBe('720p60'));
  it('a cap takes the best at or below it, else the lowest', () => {
    expect(pickQuality(q, '720p', 2000)).toBe('720p60');
    expect(pickQuality(q, '360p', 2000)).toBe('160p30');
    expect(pickQuality([q[1]!], '480p', 100)).toBe('chunked');
  });
  it('waits for the qualities to be known', () => expect(pickQuality([], 'source', 1)).toBeNull());
});
