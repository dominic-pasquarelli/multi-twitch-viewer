import { useState } from 'react';
import { House, Plus, X } from 'lucide-react';
import { channelName, kickSlugFromId, parseChannelInput } from '@/lib/channels/parseChannels';
import { KickBadge } from '../kick/KickBadge';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useUi } from '@/state/uiStore';
import { Avatar } from '@/ui/Avatar';
import { Button, IconButton } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import formStyles from '@/ui/Form.module.css';
import { useUsersFor } from '../follows/queries';
import { goHome, useLiveFavorites } from './useFavoritesHome';
import styles from './Favorites.module.css';

/** Manage favorites (the sidebar stars), including channels you don't follow. */
export function FavoritesDialog() {
  const open = useUi((s) => s.dialog === 'favorites');
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog open={open} title="Favorites" onClose={close} width={480}>
      {open && <FavoritesEditor onDone={close} />}
    </Dialog>
  );
}

function FavoritesEditor({ onDone }: { onDone(): void }) {
  const { favorites, live, streams, knownFor } = useLiveFavorites();
  const users = new Map((useUsersFor(favorites).data ?? []).map((u) => [u.login, u]));
  const { addFavorites, toggleFavorite } = useChannelPrefs.getState();
  const [text, setText] = useState('');
  const parsed = parseChannelInput(text);

  return (
    <div className={styles.editor}>
      <p>
        Starred channels sort first in the sidebar and can alert you when they go live. Whoever is
        live shows up in your Favorites view on their own, and leaves when they go offline.
      </p>
      <form
        className={styles.add}
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.length) return;
          addFavorites(parsed);
          setText('');
        }}
      >
        <input
          className={formStyles.input}
          aria-label="Add favorites"
          placeholder="Twitch names, kick:name, or channel links"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="favorites-add"
        />
        <Button type="submit" disabled={!parsed.length}>
          <Plus size={14} /> Add
        </Button>
      </form>
      {favorites.length === 0 ? (
        <p className={styles.empty}>
          No favorites yet. Star channels in the sidebar or on a stream’s hover bar, or add them
          here.
        </p>
      ) : (
        <ul className={styles.list} data-testid="favorites-list">
          {favorites.map((login) => {
            const stream = streams.get(login);
            const name = stream?.displayName ?? users.get(login)?.displayName ?? channelName(login);
            return (
              <li key={login} data-testid="favorite-row" data-channel={login} data-live={!!stream}>
                <Avatar
                  src={users.get(login)?.profileImageUrl}
                  name={name}
                  size={24}
                  live={!!stream}
                />
                <span className={styles.name}>{name}</span>
                {kickSlugFromId(login) && <KickBadge />}
                <span className={`${styles.status} ${stream ? styles.live : ''}`}>
                  {stream
                    ? `Live${stream.gameName ? ` · ${stream.gameName}` : ''}`
                    : knownFor(login)
                      ? 'Offline'
                      : 'Status unavailable'}
                </span>
                <IconButton
                  size="sm"
                  label={`Remove ${name} from favorites`}
                  icon={<X size={15} />}
                  onClick={() => toggleFavorite(login)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Close</Button>
        <Button
          variant="primary"
          disabled={!favorites.length}
          onClick={() => {
            goHome(live);
            onDone();
          }}
        >
          <House size={14} /> Open Favorites view
        </Button>
      </div>
    </div>
  );
}
