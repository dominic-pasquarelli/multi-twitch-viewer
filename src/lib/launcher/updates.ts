/**
 * "Is there a newer Windows app?" The launcher reports the commit it was built
 * from; GitHub's `latest` tag points at the commit of the newest release.
 */

export const GITHUB_REPO = 'dominic-pasquarelli/multi-twitch-viewer';
export const VERSION_PATH = '/__mtv/version';
export const DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/download/latest/MultiTwitchViewer.exe`;
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/tag/latest`;
const LATEST_TAG_API = `https://api.github.com/repos/${GITHUB_REPO}/git/ref/tags/latest`;

export interface LauncherVersion {
  version: string;
  /** Full commit SHA, or "dev" for local builds. */
  commit: string;
}

export type UpdateStatus =
  | { kind: 'not-launcher' }
  | { kind: 'dev-build'; current: LauncherVersion }
  | { kind: 'up-to-date'; current: LauncherVersion }
  | { kind: 'available'; current: LauncherVersion; latestCommit: string }
  | { kind: 'unknown'; current: LauncherVersion };

export async function checkForUpdate(fetchImpl: typeof fetch = fetch): Promise<UpdateStatus> {
  let current: LauncherVersion;
  try {
    const res = await fetchImpl(VERSION_PATH, { cache: 'no-store' });
    if (!res.ok) return { kind: 'not-launcher' };
    current = (await res.json()) as LauncherVersion;
    if (typeof current?.commit !== 'string') return { kind: 'not-launcher' };
  } catch {
    return { kind: 'not-launcher' };
  }
  if (!/^[0-9a-f]{40}$/.test(current.commit)) return { kind: 'dev-build', current };

  try {
    const res = await fetchImpl(LATEST_TAG_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return { kind: 'unknown', current };
    const body = (await res.json()) as { object?: { sha?: string } };
    const latestCommit = body.object?.sha;
    if (!latestCommit) return { kind: 'unknown', current };
    return latestCommit === current.commit
      ? { kind: 'up-to-date', current }
      : { kind: 'available', current, latestCommit };
  } catch {
    return { kind: 'unknown', current };
  }
}
