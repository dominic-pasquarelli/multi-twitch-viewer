import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  delete window.Twitch;
});

afterEach(() => {
  document
    .querySelectorAll('script[src="https://player.twitch.tv/js/embed/v1.js"]')
    .forEach((s) => s.remove());
  delete window.Twitch;
  vi.useRealTimers();
});

const script = () =>
  document.querySelector<HTMLScriptElement>(
    'script[src="https://player.twitch.tv/js/embed/v1.js"]',
  )!;
const installPlayer = () => {
  const Player = vi.fn() as unknown as NonNullable<NonNullable<Window['Twitch']>['Player']>;
  window.Twitch = { Player };
  return Player;
};

it('retries when a script loads without the Twitch player API', async () => {
  const { loadTwitchPlayer } = await import('./twitchEmbed');
  const first = loadTwitchPlayer();
  const failed = expect(first).rejects.toThrow('without Twitch.Player');
  const old = script();
  old.dispatchEvent(new Event('load'));
  await failed;
  const next = loadTwitchPlayer();
  expect(script()).not.toBe(old);
  const Player = installPlayer();
  script().dispatchEvent(new Event('load'));
  await expect(next).resolves.toBe(Player);
});

it('times out a hung script so later player reloads can retry', async () => {
  const { loadTwitchPlayer } = await import('./twitchEmbed');
  const first = loadTwitchPlayer();
  const failed = expect(first).rejects.toThrow(/timed out/i);
  await vi.advanceTimersByTimeAsync(15_000);
  await failed;
  const next = loadTwitchPlayer();
  const Player = installPlayer();
  script().dispatchEvent(new Event('load'));
  await expect(next).resolves.toBe(Player);
  expect(vi.getTimerCount()).toBe(0);
});

it('shares a pending load and clears its timeout when it succeeds', async () => {
  const { loadTwitchPlayer } = await import('./twitchEmbed');
  const first = loadTwitchPlayer();
  expect(loadTwitchPlayer()).toBe(first);
  const Player = installPlayer();
  script().dispatchEvent(new Event('load'));
  await expect(first).resolves.toBe(Player);
  expect(vi.getTimerCount()).toBe(0);
});
