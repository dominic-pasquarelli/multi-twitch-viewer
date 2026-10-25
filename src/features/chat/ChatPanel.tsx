import { useState } from 'react';
import { X } from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import { kickChatUrl, kickSlugFor } from '@/lib/kick';
import { channelName, kickSlugFromId } from '@/lib/channels/parseChannels';
import { chatEmbedUrl } from '@/lib/twitch/embedUrls';
import { displayedChannels } from '@/lib/view/groups';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { KickBadge } from '../kick/KickBadge';
import styles from './ChatPanel.module.css';

const MAX_KEPT_ALIVE = 4;

/**
 * Tabbed chat for the streams on screen. Recently viewed chats stay loaded
 * (hidden) so switching tabs is instant and keeps the scrollback.
 */
export function ChatPanel() {
  const { mock } = useServices();
  const view = useViewStore((s) => s.view);
  const channels = displayedChannels(view);
  const active = channels.includes(view.chat.channel ?? '')
    ? view.chat.channel
    : (displayedChannels(view, view.audio.active).at(-1) ?? channels[0] ?? null);
  const setChat = useViewStore((s) => s.setChat);
  // A stream playing from Kick shows its Kick chat.
  const live = useLiveStatus(view.channels).live;
  const kickFor = (c: string) => kickSlugFromId(c) ?? kickSlugFor(live.get(c));
  const [recent, setRecent] = useState<string[]>([]);

  // Track recently opened tabs (derived during render; React re-renders once).
  if (active && recent[0] !== active) {
    setRecent([active, ...recent.filter((c) => c !== active)].slice(0, MAX_KEPT_ALIVE));
  }
  const mounted = recent.filter((c) => view.channels.includes(c));

  return (
    <aside className={styles.panel} aria-label="Chat" data-testid="chat-panel">
      <div className={styles.tabs} role="tablist">
        {channels.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === active}
            className={styles.tab}
            onClick={() => setChat({ channel: c })}
          >
            {channelName(c)}
            {kickFor(c) && <KickBadge />}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <IconButton
          size="sm"
          label="Close chat (C)"
          icon={<X size={16} />}
          onClick={() => setChat({ open: false })}
        />
      </div>
      <div className={styles.frames}>
        {channels.length === 0 && <div className={styles.mock}>Add a stream to see its chat.</div>}
        {mounted.map((c) => {
          const kick = kickFor(c);
          const key = `${c}:${kick ?? ''}`; // switching platform loads the other chat
          return mock ? (
            <div
              key={key}
              className={`${styles.frame} ${styles.mock} ${c === active ? '' : styles.hidden}`}
              data-platform={kick ? 'kick' : 'twitch'}
            >
              {kick ? 'Kick chat' : 'Chat'} for <strong>{c}</strong> would appear here (mock mode).
            </div>
          ) : (
            <iframe
              key={key}
              title={`${c} ${kick ? 'Kick ' : ''}chat`}
              src={kick ? kickChatUrl(kick) : chatEmbedUrl(c, window.location.hostname)}
              className={`${styles.frame} ${c === active ? '' : styles.hidden}`}
            />
          );
        })}
      </div>
    </aside>
  );
}
