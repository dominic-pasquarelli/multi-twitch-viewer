import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_PATH, startLauncherHeartbeat } from './heartbeat';

afterEach(() => vi.useRealTimers());

describe('startLauncherHeartbeat', () => {
  it('checks in regularly when served by the launcher', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/health')
        ? new Response('multi-twitch-viewer')
        : new Response(null, { status: 204 }),
    );
    const stop = await startLauncherHeartbeat(fetchMock as unknown as typeof fetch, 1000);
    const beats = () => fetchMock.mock.calls.filter(([u]) => u === HEARTBEAT_PATH).length;
    expect(beats()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(beats()).toBe(4);
    stop();
    vi.advanceTimersByTime(3000);
    expect(beats()).toBe(4);
  });

  it('does nothing when not served by the launcher', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>', { status: 200 }));
    await startLauncherHeartbeat(fetchMock as unknown as typeof fetch, 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(startLauncherHeartbeat(failing as unknown as typeof fetch)).resolves.toBeTypeOf(
      'function',
    );
  });
});
