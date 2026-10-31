import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKickPlayerFactory, type KickPlayerCommand, type KickPlayerState } from './kickEmbed';
import { PlayerController } from './PlayerController';

afterEach(() => vi.useRealTimers());

const frameSrc = (host: HTMLElement) => host.querySelector('iframe')?.src ?? null;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Kick player (browser: no remote control)', () => {
  it('honors a pause requested before ready, without loading a new autoplay iframe', async () => {
    const host = document.createElement('div');
    const player = createKickPlayerFactory().create(host, { channel: 'xqc', muted: true });
    player.pause();
    await flush();
    expect(host.querySelector('iframe')).toBeNull();
    player.play();
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    player.destroy();
  });

  it('loads with the first mute state, reloads to change it and unloads to pause', async () => {
    const host = document.createElement('div');
    const factory = createKickPlayerFactory();
    expect(factory.capabilities).toEqual({ volume: false, playbackState: false });
    const player = factory.create(host, { channel: 'xqc', muted: true });
    const statuses: string[] = [];
    // The controller applies the app's state on ready, before the frame loads.
    const controller = new PlayerController(
      player,
      { muted: false, volume: 0.4, quality: null },
      { onStatus: (s) => statuses.push(s) },
    );
    await flush();
    expect(frameSrc(host)).toMatch(
      /^https:\/\/player\.kick\.com\/xqc\?autoplay=true&muted=false&mtv=/,
    );

    controller.update({ muted: true });
    expect(frameSrc(host)).toContain('muted=true');
    expect(host.querySelectorAll('iframe')).toHaveLength(1);

    player.pause();
    expect(host.querySelector('iframe')).toBeNull();
    expect(player.isPaused?.()).toBe(true);
    expect(statuses).toContain('paused');
    player.play();
    expect(frameSrc(host)).toContain('muted=true');
    player.destroy();
    expect(host.children).toHaveLength(0);
  });
});

describe('Kick player (desktop: frame control)', () => {
  it('serializes slow commands and coalesces to the latest audio and playback intent', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    const pending: { command: KickPlayerCommand; resolve(state: KickPlayerState | null): void }[] =
      [];
    const control = vi.fn(
      (_id: string, command: KickPlayerCommand) =>
        new Promise<KickPlayerState | null>((resolve) => pending.push({ command, resolve })),
    );
    const player = createKickPlayerFactory(control).create(document.createElement('div'), {
      channel: 'xqc',
      muted: true,
    });
    const playing = vi.fn();
    player.on('playing', playing);
    await flush();
    player.setVolume(0.2);
    player.setMuted(false);
    player.pause();
    player.play();
    player.pause(); // only the latest requested playback state should be sent
    await vi.advanceTimersByTimeAsync(3000);
    expect(control).toHaveBeenCalledTimes(1);
    pending[0]!.resolve({ muted: true, volume: 0.5, paused: false });
    await flush();
    expect(playing).not.toHaveBeenCalled(); // this was an obsolete reply
    expect(pending[1]!.command).toEqual({ muted: false, volume: 0.2, pause: true });
    pending[1]!.resolve({ muted: false, volume: 0.2, paused: true });
    await flush();
    expect(player.isPaused?.()).toBe(true);
    expect(player.getVolume()).toBe(0.2);
    player.destroy();
  });

  it('retains a play/pause request while the frame has no video yet', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    let hasVideo = false;
    const control = vi.fn(async (_id: string, command: KickPlayerCommand) =>
      hasVideo ? { muted: true, volume: 0.5, paused: command.pause === true } : null,
    );
    const player = createKickPlayerFactory(control).create(document.createElement('div'), {
      channel: 'xqc',
      muted: true,
    });
    player.pause();
    await flush();
    hasVideo = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(control.mock.calls.at(-1)?.[1]).toMatchObject({ pause: true });
    expect(player.isPaused?.()).toBe(true);
    player.destroy();
  });

  it("keeps the video at the app's mute and volume, and plays and pauses it", async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    const commands: KickPlayerCommand[] = [];
    let video = { paused: false, muted: true, volume: 0 };
    const control = vi.fn(async (_id: string, command: KickPlayerCommand) => {
      commands.push(command);
      video = {
        paused: command.pause ? true : command.play ? false : video.paused,
        muted: command.muted ?? video.muted,
        volume: command.volume ?? video.volume,
      };
      return { ...video };
    });
    const host = document.createElement('div');
    const factory = createKickPlayerFactory(control);
    expect(factory.capabilities).toEqual({ volume: true, playbackState: true });
    const player = factory.create(host, { channel: 'xqc', muted: true });
    player.setMuted(false);
    player.setVolume(0.4);
    await flush();
    expect(frameSrc(host)).toContain('muted=false');

    await vi.advanceTimersByTimeAsync(1000);
    expect(commands.at(-1)).toEqual({ muted: false, volume: 0.4 });
    // Kick's player restores its own volume after an unmute; the next tick puts it back.
    video.volume = 0.6;
    await vi.advanceTimersByTimeAsync(1000);
    expect(video.volume).toBe(0.4);
    expect(player.getVolume()).toBe(0.4);
    expect(player.getMuted()).toBe(false);

    player.pause();
    await vi.advanceTimersByTimeAsync(0);
    expect(commands.at(-1)).toEqual({ muted: false, volume: 0.4, pause: true });
    expect(player.isPaused?.()).toBe(true);
    player.play();
    await vi.advanceTimersByTimeAsync(0);
    expect(player.isPaused?.()).toBe(false);
    player.destroy();
  });
});
