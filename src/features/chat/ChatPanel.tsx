import { useState } from 'react';
import { X } from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import { chatEmbedUrl } from '@/lib/twitch/embedUrls';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import styles from './ChatPanel.module.css';

const MAX_KEPT_ALIVE = 4;

/**
 * Tabbed chat for the streams on screen. Recently viewed chats stay loaded
 * (hidden) so switching tabs is instant and keeps the scrollback.
 */
export function ChatPanel() {
  const { mock } = useServices();
  const channels = useViewStore((s) => s.view.channels);
  const active = useViewStore((s) => s.view.chat.channel);
  const setChat = useViewStore((s) => s.setChat);
  const [recent, setRecent] = useState<string[]>([]);

  // Track recently opened tabs (derived during render; React re-renders once).
  if (active && recent[0] !== active) {
    setRecent([active, ...recent.filter((c) => c !== active)].slice(0, MAX_KEPT_ALIVE));
  }
  const mounted = recent.filter((c) => channels.includes(c));

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
            {c}
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
        {mounted.map((c) =>
          mock ? (
            <div
              key={c}
              className={`${styles.frame} ${styles.mock} ${c === active ? '' : styles.hidden}`}
            >
              Chat for <strong>{c}</strong> would appear here (mock mode).
            </div>
          ) : (
            <iframe
              key={c}
              title={`${c} chat`}
              src={chatEmbedUrl(c, window.location.hostname)}
              className={`${styles.frame} ${c === active ? '' : styles.hidden}`}
            />
          ),
        )}
      </div>
    </aside>
  );
}
