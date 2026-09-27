// @ts-check
// Updates without GitHub releases or Actions: the installed app knows which
// commit it was built from (the installer script stamps it in), compares it
// with the newest commit on GitHub, and "Update now" re-runs the installer
// script, which rebuilds and reinstalls the app on this PC.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO = 'dominic-pasquarelli/multi-twitch-viewer';
export const BRANCH = 'main';
export const INSTALL_SCRIPT_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/scripts/windows/install.ps1`;

/**
 * @typedef {{
 *   state: 'dev' | 'checking' | 'up-to-date' | 'available' | 'error';
 *   current: string | null;
 *   latest?: string;
 *   latestMessage?: string;
 *   error?: string;
 *   checkedAt?: string;
 * }} UpdateStatus
 */

/** The commit this build was made from (null when run from source). @param {string} appPath */
export function readBuildCommit(appPath) {
  try {
    const pkg = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8'));
    return typeof pkg.buildCommit === 'string' && /^[0-9a-f]{40}$/.test(pkg.buildCommit)
      ? pkg.buildCommit
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null} current
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<UpdateStatus>}
 */
export async function checkForUpdate(current, fetchImpl = fetch) {
  const checkedAt = new Date().toISOString();
  if (!current) return { state: 'dev', current, checkedAt };
  try {
    const { sha, message: latestMessage } = await latestCommit(fetchImpl);
    return sha === current
      ? { state: 'up-to-date', current, latest: sha, latestMessage, checkedAt }
      : { state: 'available', current, latest: sha, latestMessage, checkedAt };
  } catch (err) {
    return {
      state: 'error',
      current,
      error: err instanceof Error ? err.message : String(err),
      checkedAt,
    };
  }
}

/**
 * Newest commit on the branch. Uses the GitHub API (which also gives the
 * commit message); if that is rate-limited, falls back to the same endpoint
 * `git fetch` uses, which has no API limit.
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ sha: string; message: string | undefined }>}
 */
export async function latestCommit(fetchImpl) {
  const api = await fetchImpl(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'multi-twitch-viewer' },
  }).catch(() => null);
  if (api?.ok) {
    const body = /** @type {{ sha?: string; commit?: { message?: string } }} */ (await api.json());
    if (body.sha) return { sha: body.sha, message: (body.commit?.message ?? '').split('\n')[0] };
  }
  const refs = await fetchImpl(`https://github.com/${REPO}.git/info/refs?service=git-upload-pack`, {
    headers: { 'User-Agent': 'git/2.45 multi-twitch-viewer' },
  });
  if (!refs.ok) throw new Error(`GitHub answered ${api?.status ?? 'nothing'} / ${refs.status}`);
  const sha = new RegExp(`([0-9a-f]{40}) refs/heads/${BRANCH}\\b`).exec(await refs.text())?.[1];
  if (!sha) throw new Error('Unexpected answer from GitHub');
  return { sha, message: undefined };
}

/** PowerShell command that downloads and runs the newest installer script. */
export const updaterCommand = () =>
  '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ' +
  `& ([scriptblock]::Create((New-Object Net.WebClient).DownloadString('${INSTALL_SCRIPT_URL}'))) -FromApp`;

/**
 * Starts the installer script in its own console window (so progress is
 * visible), independent of the app, which then quits and gets replaced.
 * @param {typeof spawn} [spawnImpl]
 */
export function startUpdater(spawnImpl = spawn) {
  const child = spawnImpl(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', updaterCommand()],
    { detached: true, stdio: 'ignore', windowsHide: false },
  );
  child.unref();
}
