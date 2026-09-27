// @ts-check
// Tidies Twitch's own player UI inside the embedded players (desktop app only:
// the players are cross-origin iframes, which only Electron's main process can
// reach). Currently: hide the stream-info overlay at the top (channel, title,
// avatar, Follow/Subscribe/Gift) and keep Twitch's bottom controls.

/** @param {string} url */
export function isPlayerFrameUrl(url) {
  try {
    return new URL(url).hostname === 'player.twitch.tv';
  } catch {
    return false;
  }
}

/**
 * Runs inside a player frame (serialized, so it must be self-contained).
 * Twitch's class names change often, so this doesn't rely on them: it starts
 * from the channel link and the Follow/Subscribe/Gift buttons near the top and
 * hides the largest block around them that holds neither the video nor the
 * playback controls. A MutationObserver re-applies it as Twitch re-renders.
 * @param {boolean} enabled
 */
export function applyStreamInfoHiding(enabled) {
  const w = /** @type {any} */ (window);
  const d = document;
  const MARK = 'data-mtv-hidden';
  w.__mtvStreamInfo?.disconnect();
  delete w.__mtvStreamInfo;
  d.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));
  d.getElementById('mtv-stream-info-style')?.remove();
  if (!enabled) return;

  const style = d.createElement('style');
  style.id = 'mtv-stream-info-style';
  style.textContent = `[${MARK}]{opacity:0!important;visibility:hidden!important;pointer-events:none!important}`;
  (d.head || d.documentElement).appendChild(style);

  const KEEP = [
    'video',
    '[data-a-target="player-controls"]',
    '[data-a-target="player-play-pause-button"]',
    '[data-a-target="player-mute-unmute-button"]',
    '[data-a-target="player-settings-button"]',
    '[data-a-target="player-fullscreen-button"]',
  ].join(',');
  const SEED_TARGET = /follow|subscribe|sub-button|gift|player-info|stream-title|channel/i;
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
    if (el.closest(KEEP) || !inTopHalf(el)) return false;
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

  const scan = () => {
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
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let pending;
  const observer = new MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = undefined;
      scan();
    }, 50);
  });
  observer.observe(d.documentElement, { childList: true, subtree: true });
  w.__mtvStreamInfo = observer;
  scan();
}

/** @param {{ hideStreamInfo: boolean }} options */
export function playerChromeScript(options) {
  return `(${applyStreamInfoHiding.toString()})(${JSON.stringify(Boolean(options.hideStreamInfo))});`;
}

/**
 * Applies the options to one frame, if it is a Twitch player.
 * @param {{ url: string, executeJavaScript(code: string): Promise<unknown> } | null | undefined} frame
 * @param {{ hideStreamInfo: boolean }} options
 */
export function applyPlayerChrome(frame, options) {
  if (!frame || !isPlayerFrameUrl(frame.url)) return;
  frame.executeJavaScript(playerChromeScript(options)).catch(() => {
    // The frame navigated or closed meanwhile; the next load applies it again.
  });
}
