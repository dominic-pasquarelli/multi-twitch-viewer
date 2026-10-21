// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyKickCommand,
  controlKickPlayer,
  kickPlayerIdFromUrl,
  normalizeKickCommand,
} from './kickPlayer.mjs';

afterEach(() => document.body.replaceChildren());

describe('Kick player control', () => {
  it('finds only Kick player frames the page tagged', () => {
    expect(kickPlayerIdFromUrl('https://player.kick.com/xqc?autoplay=true&mtv=k1a')).toBe('k1a');
    expect(kickPlayerIdFromUrl('https://player.kick.com/xqc')).toBeNull();
    expect(kickPlayerIdFromUrl('http://player.kick.com/xqc?mtv=k1')).toBeNull();
    expect(kickPlayerIdFromUrl('https://evil.com/?mtv=k1')).toBeNull();
    expect(kickPlayerIdFromUrl('https://player.kick.com/x?mtv=../../a')).toBeNull();
  });

  it('accepts only known command fields', () => {
    expect(normalizeKickCommand({ muted: false, volume: 3, play: true, x: 1 })).toEqual({
      muted: false,
      volume: 1,
      play: true,
    });
    expect(normalizeKickCommand({ muted: 'no', volume: NaN, pause: 'yes' })).toEqual({});
    expect(normalizeKickCommand(null)).toEqual({});
  });

  it('sets the video and reports its state', () => {
    expect(applyKickCommand({})).toBeNull(); // no video yet
    const video = document.createElement('video');
    document.body.appendChild(video);
    expect(applyKickCommand({ muted: true, volume: 0.3 })).toEqual({
      paused: true,
      muted: true,
      volume: 0.3,
    });
  });

  it('runs the command in the matching frame only, as a user gesture', async () => {
    /** @type {[string, string, boolean | undefined][]} */
    const ran = [];
    const frame = (url) => ({
      url,
      executeJavaScript: async (/** @type {string} */ code, /** @type {boolean} */ gesture) => {
        ran.push([url, code, gesture]);
        return { paused: false, muted: false, volume: 0.5 };
      },
    });
    const frames = [
      frame('https://player.twitch.tv/?channel=a'),
      frame('https://player.kick.com/a?mtv=k1'),
      frame('https://player.kick.com/b?mtv=k2'),
    ];
    expect(await controlKickPlayer(frames, 'k2', { muted: false })).toEqual({
      paused: false,
      muted: false,
      volume: 0.5,
    });
    expect(ran).toHaveLength(1);
    expect(ran[0]?.[0]).toBe('https://player.kick.com/b?mtv=k2');
    expect(ran[0]?.[1]).toContain('{"muted":false}');
    expect(ran[0]?.[2]).toBe(true);
    expect(await controlKickPlayer(frames, 'missing', {})).toBeNull();
    expect(await controlKickPlayer(frames, 'bad id!', {})).toBeNull();
  });
});
