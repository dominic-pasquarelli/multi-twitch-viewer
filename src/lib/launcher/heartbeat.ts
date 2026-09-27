/**
 * When the app is served by the Windows launcher (MultiTwitchViewer.exe), it
 * checks in every so often so the launcher can quit once every app window is
 * closed. Under `npm start`/`npm run dev` the health check fails and this
 * does nothing.
 */

export const HEALTH_PATH = '/__mtv/health';
export const HEARTBEAT_PATH = '/__mtv/heartbeat';
const HEALTH_BODY = 'multi-twitch-viewer';
export const HEARTBEAT_MS = 20_000;

export async function startLauncherHeartbeat(
  fetchImpl: typeof fetch = fetch,
  intervalMs = HEARTBEAT_MS,
): Promise<() => void> {
  try {
    const res = await fetchImpl(HEALTH_PATH, { cache: 'no-store' });
    if (!res.ok || (await res.text()) !== HEALTH_BODY) return () => {};
  } catch {
    return () => {};
  }
  const beat = () =>
    void fetchImpl(HEARTBEAT_PATH, { method: 'POST', cache: 'no-store' }).catch(() => {});
  beat();
  const id = setInterval(beat, intervalMs);
  return () => clearInterval(id);
}
