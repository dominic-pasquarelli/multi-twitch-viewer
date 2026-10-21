// @ts-check
// Controls Kick's embedded players (desktop app only). Kick's embed has no
// JavaScript API and is a cross-origin iframe, so the main process runs a
// small script inside the frame to set the <video>'s mute and volume and to
// play or pause it, much as playerChrome.mjs does for Twitch's own UI.

/** Each Kick player the page creates carries `?mtv=<id>` so it can be found again. */
const ID_RE = /^[a-z0-9]{1,40}$/;

/** @param {string} url */
export function kickPlayerIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'player.kick.com') return null;
    const id = u.searchParams.get('mtv');
    return id && ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} KickCommand
 * @property {boolean} [muted]
 * @property {number} [volume] 0–1
 * @property {boolean} [play]
 * @property {boolean} [pause]
 */

/**
 * Only known fields, with the right types (the page sends them over IPC).
 * @param {unknown} input
 * @returns {KickCommand}
 */
export function normalizeKickCommand(input) {
  const c = /** @type {Record<string, unknown>} */ (input ?? {});
  /** @type {KickCommand} */
  const out = {};
  if (typeof c.muted === 'boolean') out.muted = c.muted;
  if (typeof c.volume === 'number' && Number.isFinite(c.volume))
    out.volume = Math.min(1, Math.max(0, c.volume));
  if (c.play === true) out.play = true;
  if (c.pause === true) out.pause = true;
  return out;
}

/**
 * Runs inside a Kick player frame (serialized, so it must be self-contained).
 * Returns the video's state, or null while the player has none yet.
 * @param {KickCommand} command
 */
export function applyKickCommand(command) {
  const video = document.querySelector('video');
  if (!video) return null;
  if (typeof command.volume === 'number') video.volume = command.volume;
  if (typeof command.muted === 'boolean') video.muted = command.muted;
  if (command.pause) video.pause();
  if (command.play) void video.play().catch(() => {});
  return { paused: video.paused, muted: video.muted, volume: video.volume };
}

/**
 * Sends a command to the Kick player frame with this id.
 * @param {Iterable<{url: string, executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>}>} frames
 * @param {string} id
 * @param {unknown} command
 * @returns {Promise<{paused: boolean, muted: boolean, volume: number} | null>}
 */
export async function controlKickPlayer(frames, id, command) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const frame = [...frames].find((f) => kickPlayerIdFromUrl(f.url) === id);
  if (!frame) return null;
  const script = `(${applyKickCommand.toString()})(${JSON.stringify(normalizeKickCommand(command))})`;
  try {
    // As a user gesture, so unmuting and playing are allowed.
    const state = /** @type {any} */ (await frame.executeJavaScript(script, true));
    return state &&
      typeof state.paused === 'boolean' &&
      typeof state.muted === 'boolean' &&
      typeof state.volume === 'number'
      ? { paused: state.paused, muted: state.muted, volume: state.volume }
      : null;
  } catch {
    return null; // the frame navigated or closed meanwhile
  }
}
