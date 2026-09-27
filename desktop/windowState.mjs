// @ts-check
// Remembers the window's size, position, maximized and fullscreen state.

/**
 * @typedef {{ x: number; y: number; width: number; height: number }} Bounds
 * @typedef {{ bounds?: Bounds; maximized?: boolean; fullscreen?: boolean; trayHintShown?: boolean }} WindowState
 */

export const DEFAULT_SIZE = { width: 1600, height: 900 };
const MIN_VISIBLE = 120;

/**
 * Returns bounds that are safe to open with: the saved ones if they are still
 * mostly on a connected monitor, otherwise a default size centred on the
 * primary monitor (e.g. after unplugging a second screen).
 * @param {Bounds | undefined} saved
 * @param {Bounds[]} workAreas display work areas; the first is the primary
 * @returns {Bounds}
 */
export function restoreBounds(saved, workAreas) {
  const primary = workAreas[0] ?? { x: 0, y: 0, ...DEFAULT_SIZE };
  if (saved && isNumberBounds(saved)) {
    const visible = workAreas.some((a) => {
      const w = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x);
      const h = Math.min(saved.y + saved.height, a.y + a.height) - Math.max(saved.y, a.y);
      return w >= MIN_VISIBLE && h >= MIN_VISIBLE;
    });
    if (visible) return saved;
  }
  const width = Math.min(DEFAULT_SIZE.width, primary.width);
  const height = Math.min(DEFAULT_SIZE.height, primary.height);
  return {
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    width,
    height,
  };
}

/** @param {unknown} v @returns {v is Bounds} */
const isNumberBounds = (v) =>
  typeof v === 'object' &&
  v !== null &&
  ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(/** @type {any} */ (v)[k])) &&
  /** @type {Bounds} */ (v).width > 200 &&
  /** @type {Bounds} */ (v).height > 150;

/** @param {string} text @returns {WindowState} */
export function parseState(text) {
  try {
    const data = JSON.parse(text);
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}
