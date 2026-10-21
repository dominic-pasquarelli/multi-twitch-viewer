import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKickPlayerFactory, type KickPlayerCommand } from './kickEmbed';
import { PlayerController } from './PlayerController';

afterEach(() => vi.useRealTimers());

const frameSrc = (host: HTMLElement) => host.querySelector('iframe')?.src ?? null;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Kick player (browser: no remote control)', () => {
  it('loads with the first mute state, reloads to change it and unloads to pause', async () => {
    const host = document.createElement('div');
    const factory = createKickPlayerFactory();
    expect(factory.capabilities).toEqual({ volume: false });
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
    expect(factory.capabilities).toEqual({ volume: true });
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
