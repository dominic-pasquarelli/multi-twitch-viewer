import { normalizeLogin } from '../channels/parseChannels';
import { MAX_CHANNELS, type ViewState } from './types';
import { emptyView, normalize } from './operations';
import { normalizeGroups, sanitizeGroups } from './groups';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const logins = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .map((x) => (typeof x === 'string' ? normalizeLogin(x) : null))
            .filter((x): x is string => !!x),
        ),
      ]
    : [];

/**
 * Turns untrusted data (an imported file, old saved state, a URL) into a
 * valid ViewState, filling in defaults. Returns null if it has no channels list.
 */
export function sanitizeView(input: unknown): ViewState | null {
  if (!isObject(input) || !Array.isArray(input.channels)) return null;
  const base = emptyView();
  const layout = isObject(input.layout) ? input.layout : {};
  const audio = isObject(input.audio) ? input.audio : {};
  const chat = isObject(input.chat) ? input.chat : {};
  const scale = layout.mainScale;
  const main = typeof layout.main === 'string' ? normalizeLogin(layout.main) : null;
  const chatChannel = typeof chat.channel === 'string' ? normalizeLogin(chat.channel) : null;

  const channels = logins(input.channels).slice(0, MAX_CHANNELS);
  return normalizeGroups(
    normalize({
      channels,
      ...(Array.isArray(input.groups) ? { groups: sanitizeGroups(input.groups, channels) } : {}),
      ...(typeof input.activeGroup === 'string' ? { activeGroup: input.activeGroup } : {}),
      layout: {
        mode: layout.mode === 'focus' ? 'focus' : 'grid',
        main,
        mainScale: typeof scale === 'number' && scale > 0 && scale <= 1 ? scale : 'auto',
      },
      audio: {
        mode: audio.mode === 'mix' || audio.mode === 'duck' ? audio.mode : base.audio.mode,
        active: logins(audio.active),
      },
      chat: { open: chat.open === true, channel: chatChannel },
    }),
  );
}
