// @ts-check
// Updates without GitHub releases or Actions: the installed app knows which
// commit it was built from (the installer script stamps it in), compares it
// with the newest commit on GitHub, and "Update now" re-runs the installer
// script, which rebuilds and reinstalls the app on this PC.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO = 'dominic-pasquarelli/multi-twitch-viewer';
export const BRANCH = 'main';
export const INSTALL_SCRIPT_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/scripts/windows/install.ps1`;

/**
 * @typedef {{
 *   state: 'dev' | 'checking' | 'up-to-date' | 'available' | 'installing' | 'error';
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

/** A .cmd file that runs the updater in a visible console window. */
export const updaterCmdScript = () =>
  [
    '@echo off',
    'title Multi Twitch Viewer - updating',
    'echo Updating Multi Twitch Viewer. The app closes and reopens by itself when the new version is ready.',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${updaterCommand()}"`,
    'if errorlevel 1 pause',
    '',
  ].join('\r\n');

/**
 * Starts the updater in its own window, fully independent of the app: the
 * app writes a small .cmd file and asks Explorer to open it (a process the
 * app starts itself can be shut down when the app closes). The app keeps
 * running; the script closes it just before installing and reopens it after.
 * @param {{ dir: string; spawnImpl?: typeof spawn; writeFile?: typeof writeFileSync }} opts
 * @returns {string} the .cmd file's path
 */
export function startUpdater({ dir, spawnImpl = spawn, writeFile = writeFileSync }) {
  const file = join(dir, 'update-multi-twitch-viewer.cmd');
  writeFile(file, updaterCmdScript());
  const launch = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
    const child = spawnImpl(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return child;
  };
  // Fallback if Explorer can't be started for some reason.
  launch('explorer.exe', [file]).on('error', () => launch('cmd.exe', ['/c', 'start', '""', file]));
  return file;
}
