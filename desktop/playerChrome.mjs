// @ts-check
// Tidies Twitch's own player UI inside the embedded players (desktop app only:
// the players are cross-origin iframes, which only Electron's main process can
// reach): hide the stream-info overlay at the top (channel, title, avatar,
// Follow/Subscribe/Gift) but keep Twitch's bottom controls, and click through
// the "intended for certain audiences" notice.

/** @param {string} url */
export function isPlayerFrameUrl(url) {
  try {
    return new URL(url).hostname === 'player.twitch.tv';
  } catch {
    return false;
  }
}

/**
 * @typedef {object} PlayerChrome
 * @property {boolean} hideStreamInfo Hide the channel/title/Follow/Subscribe overlay at the top.
 * @property {boolean} skipContentWarning Click "Start watching" on the
 *   "intended for certain audiences" notice so the stream just plays.
 */

/** @type {PlayerChrome} */
export const DEFAULT_PLAYER_CHROME = { hideStreamInfo: true, skipContentWarning: true };

/**
 * Only known options, as booleans (the page sends them over IPC).
 * @param {unknown} options
 * @returns {PlayerChrome}
 */
export function normalizePlayerChrome(options) {
  const o = /** @type {Partial<Record<keyof PlayerChrome, unknown>>} */ (options ?? {});
  return {
    hideStreamInfo: Boolean(o.hideStreamInfo ?? DEFAULT_PLAYER_CHROME.hideStreamInfo),
    skipContentWarning: Boolean(o.skipContentWarning ?? DEFAULT_PLAYER_CHROME.skipContentWarning),
  };
}

/**
 * Runs inside a player frame (serialized, so it must be self-contained).
 * Twitch's class names change often, so this avoids them:
 * - stream info: starts from the channel link and the Follow/Subscribe/Gift
 *   buttons near the top and hides the largest block around them that holds
 *   neither the video nor the playback controls;
 * - content notice: clicks its "Start watching" button (by Twitch's test ids,
 *   or by the button text as a fallback); for the newer blurred-video style,
 *   presses play once per load and hides the "Intended for…" chip.
 * A MutationObserver re-applies both as Twitch re-renders.
 * @param {PlayerChrome} options
 */
export function applyPlayerTweaks(options) {
  const w = /** @type {any} */ (window);
  const d = document;
  const MARK = 'data-mtv-hidden';
  w.__mtvPlayerTweaks?.disconnect();
  delete w.__mtvPlayerTweaks;
  d.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));
  d.getElementById('mtv-stream-info-style')?.remove();
  if (!options.hideStreamInfo && !options.skipContentWarning) return;

  {
    const style = d.createElement('style');
    style.id = 'mtv-stream-info-style';
    style.textContent = `[${MARK}]{opacity:0!important;visibility:hidden!important;pointer-events:none!important}`;
    (d.head || d.documentElement).appendChild(style);
  }

  const KEEP = [
    'video',
    '[data-a-target="player-controls"]',
    '[data-a-target="player-play-pause-button"]',
    '[data-a-target="player-mute-unmute-button"]',
    '[data-a-target="player-settings-button"]',
    '[data-a-target="player-fullscreen-button"]',
  ].join(',');
  const SEED_TARGET = /follow|subscribe|sub-button|gift|player-info|stream-title|channel/i;
  const GATE_BUTTON = [
    '[data-a-target="content-classification-gate-overlay-start-watching-button"]',
    '[data-a-target="player-overlay-mature-accept"]',
  ].join(',');
  /** @param {Element} el */
  const keeps = (el) => el.matches(KEEP) || el.querySelector(KEEP) !== null;
  /** @param {Element} el */
  const inTopHalf = (el) => {
    const r = el.getBoundingClientRect();
    return r.height === 0 || r.top < w.innerHeight / 2;
  };
  /** @param {Element} el */
  const tall = (el) => el.getBoundingClientRect().height > w.innerHeight / 2;
  /** @param {Element} el */
  const isSeed = (el) => {
    if (el.closest(KEEP) || el.closest(GATE_BUTTON) || !inTopHalf(el)) return false;
    if (SEED_TARGET.test(el.getAttribute('data-a-target') ?? '')) return true;
    if (el instanceof HTMLAnchorElement) {
      try {
        const u = new URL(el.href);
        return /(^|\.)twitch\.tv$/.test(u.hostname) && u.pathname.length > 1;
      } catch {
        return false;
      }
    }
    return false;
  };

  const hideStreamInfo = () => {
    for (const seed of d.querySelectorAll('a[href], button, [data-a-target]')) {
      if (seed.closest(`[${MARK}]`) || !isSeed(seed)) continue;
      let node = seed;
      while (
        node.parentElement &&
        node.parentElement !== d.body &&
        !keeps(node.parentElement) &&
        !tall(node.parentElement)
      ) {
        node = node.parentElement;
      }
      if (!keeps(node)) node.setAttribute(MARK, '');
    }
  };
  // Newer players blur the video behind an "Intended for certain audiences"
  // chip until you press play. Start it once per load and hide the chip.
  const GATE_CHIP = /intended for certain audiences|content classification/i;
  const startGatedStream = () => {
    const chip = [...d.querySelectorAll('button, [role="button"]')].find(
      (b) => !b.matches(GATE_BUTTON) && GATE_CHIP.test(b.textContent ?? ''),
    );
    if (!chip) return;
    if (!chip.hasAttribute(MARK)) chip.setAttribute(MARK, '');
    if (!w.__mtvGateStarted) {
      w.__mtvGateStarted = true;
      pressPlay();
    }
  };
  const skipContentWarning = () => {
    startGatedStream();
    const button =
      d.querySelector(GATE_BUTTON) ??
      [...d.querySelectorAll('button')].find((b) =>
        /^\s*start watching\s*$/i.test(b.textContent ?? ''),
      );
    // Click each notice once (it goes away when accepted).
    if (button instanceof HTMLElement && !button.hasAttribute('data-mtv-clicked')) {
      button.setAttribute('data-mtv-clicked', '');
      button.click();
    }
  };
  const run = () => {
    if (options.skipContentWarning) skipContentWarning();
    if (options.hideStreamInfo) hideStreamInfo();
  };

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let pending;
  const observer = new MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = undefined;
      run();
    }, 50);
  });
  observer.observe(d.documentElement, { childList: true, subtree: true });
  w.__mtvPlayerTweaks = observer;
  run();
}

/**
 * Runs inside a player frame: starts the stream if it isn't playing, the way
 * you would (Twitch's own play button), which also gets past a
 * content-classification blur that the embed API's play() can't.
 * @returns {'playing' | 'clicked' | 'video' | 'none'}
 */
export function pressPlay() {
  const video = document.querySelector('video');
  if (video && !video.paused && !video.ended) return 'playing';
  const button =
    document.querySelector('[data-a-target="player-overlay-play-button"]') ??
    document.querySelector('[data-a-target="player-play-pause-button"]');
  if (button instanceof HTMLElement) {
    button.click();
    return 'clicked';
  }
  if (!video) return 'none';
  video.play()?.catch(() => {});
  return 'video';
}

/** @param {PlayerChrome} options */
export function playerChromeScript(options) {
  const opts = JSON.stringify(normalizePlayerChrome(options));
  return `(() => { const pressPlay = ${pressPlay.toString()}; (${applyPlayerTweaks.toString()})(${opts}); })();`;
}

/**
 * "Play all": presses play in every Twitch player frame that isn't playing.
 * @param {Iterable<{ url: string, executeJavaScript(code: string, userGesture?: boolean): Promise<unknown> }>} frames
 */
export function playAllFrames(frames) {
  for (const frame of frames) {
    if (!isPlayerFrameUrl(frame.url)) continue;
    // As a user gesture, so the player treats it like a real click.
    frame.executeJavaScript(`(${pressPlay.toString()})()`, true).catch(() => {});
  }
}

/**
 * Applies the options to one frame, if it is a Twitch player.
 * @param {{ url: string, executeJavaScript(code: string): Promise<unknown> } | null | undefined} frame
 * @param {PlayerChrome} options
 */
export function applyPlayerChrome(frame, options) {
  if (!frame || !isPlayerFrameUrl(frame.url)) return;
  frame.executeJavaScript(playerChromeScript(options)).catch(() => {
    // The frame navigated or closed meanwhile; the next load applies it again.
  });
}
