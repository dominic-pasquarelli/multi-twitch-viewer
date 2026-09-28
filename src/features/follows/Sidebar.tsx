import { useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Star,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/servicesContext';
import { favoritesFirst } from '@/lib/alerts/goLive';
import type { LiveStream } from '@/lib/twitch/types';
import { formatCount, formatUptime, sizedThumbnail } from '@/lib/utils/format';
import { useAuth } from '@/state/authStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings, type SidebarSort } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useViewStore } from '@/state/viewStore';
import { Avatar } from '@/ui/Avatar';
import { IconButton } from '@/ui/Button';
import { LoginButton } from '../auth/LoginPrompt';
import { CHANNEL_MIME, setDragging } from '../viewer/dnd';
import {
  useFollowedChannels,
  useFollowedLive,
  useLiveStatus,
  type FollowedChannelInfo,
} from './queries';
import styles from './Sidebar.module.css';

interface Row {
  login: string;
  displayName: string;
  avatar: string;
  stream?: LiveStream;
}

function sortLive(streams: LiveStream[], sort: SidebarSort): LiveStream[] {
  const copy = [...streams];
  if (sort === 'name') copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
  else if (sort === 'uptime')
    copy.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  else copy.sort((a, b) => b.viewerCount - a.viewerCount);
  return copy;
}

/** Click: add/remove. Shift+click: watch only this. Drag: drop onto the viewer. */
function useRowHandlers(login: string) {
  return {
    onClick: (e: MouseEvent) => {
      const store = useViewStore.getState();
      if (e.shiftKey) store.watchOnly([login]);
      else store.toggleChannel(login);
    },
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(CHANNEL_MIME, login);
      e.dataTransfer.setData('text/plain', login);
      e.dataTransfer.effectAllowed = 'copy';
      setDragging(true);
    },
    onDragEnd: () => setDragging(false),
  };
}

export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const update = useSettings((s) => s.update);
  const toggle = () => update({ sidebarCollapsed: !collapsed });
  return collapsed ? <CollapsedRail onExpand={toggle} /> : <ExpandedSidebar onCollapse={toggle} />;
}

function useRows() {
  const live = useFollowedLive();
  const follows = useFollowedChannels();
  const sort = useSettings((s) => s.sidebarSort);
  const favorites = useChannelPrefs((s) => s.favorites);
  return useMemo(() => {
    const avatars = new Map<string, FollowedChannelInfo>(
      (follows.data ?? []).map((f) => [f.login, f]),
    );
    const liveRows: Row[] = favoritesFirst(sortLive(live.data ?? [], sort), favorites).map((s) => ({
      login: s.login,
      displayName: s.displayName,
      avatar: avatars.get(s.login)?.profileImageUrl ?? '',
      stream: s,
    }));
    const liveSet = new Set(liveRows.map((r) => r.login));
    const offlineRows: Row[] = favoritesFirst(
      (follows.data ?? [])
        .filter((f) => !liveSet.has(f.login))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      favorites,
    ).map((f) => ({ login: f.login, displayName: f.displayName, avatar: f.profileImageUrl }));
    return { liveRows, offlineRows, live, follows };
  }, [live, follows, sort, favorites]);
}

/** Adds these channels to the view (Undo puts it back as it was). */
function watchAll(logins: string[]) {
  const store = useViewStore.getState();
  const added = logins.filter((l) => !store.view.channels.includes(l)).length;
  store.addChannels(logins);
  toast(`Added ${added} live stream${added === 1 ? '' : 's'}`, {
    action: { label: 'Undo', run: () => useViewStore.getState().undo() },
  });
}

/** Streams in the view that aren't in your follows, so they can be removed here too. */
function useNotFollowedRows(inView: string[], follows: FollowedChannelInfo[] | undefined): Row[] {
  const followed = useMemo(() => new Set(follows?.map((f) => f.login)), [follows]);
  const logins = useMemo(
    () => (follows ? inView.filter((l) => !followed.has(l)) : []),
    [inView, follows, followed],
  );
  const { live } = useLiveStatus(logins);
  return logins.map((login) => {
    const stream = live.get(login);
    return { login, displayName: stream?.displayName ?? login, avatar: '', stream };
  });
}

function ExpandedSidebar({ onCollapse }: { onCollapse(): void }) {
  const status = useAuth((s) => s.status);
  const { api } = useServices();
  const { liveRows, offlineRows, live, follows } = useRows();
  const inView = useViewStore((s) => s.view.channels);
  const { sidebarSort, showOfflineFollows, update } = useSettings();
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<{ stream: LiveStream; top: number; left: number } | null>(
    null,
  );
  const queryClient = useQueryClient();

  const match = (r: Row) => {
    const q = filter.trim().toLowerCase();
    return (
      !q ||
      r.login.includes(q) ||
      r.displayName.toLowerCase().includes(q) ||
      (r.stream?.gameName.toLowerCase().includes(q) ?? false)
    );
  };
  const shownLive = liveRows.filter(match);
  const shownOffline = offlineRows.filter(match);
  const others = useNotFollowedRows(inView, follows.isSuccess ? follows.data : undefined);

  return (
    <aside className={styles.sidebar} aria-label="Followed channels">
      <div className={styles.header}>
        <h2>Followed</h2>
        {api && (
          <IconButton
            size="sm"
            label="Refresh now"
            icon={<RefreshCw size={14} className={live.isFetching ? 'spin' : undefined} />}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['followed-live'] })}
          />
        )}
        <IconButton
          size="sm"
          label="Collapse sidebar (B)"
          icon={<PanelLeftClose size={16} />}
          onClick={onCollapse}
        />
      </div>

      {!api ? (
        <div className={styles.notice}>
          {status === 'expired' ? (
            <span>
              <strong>Your Twitch login expired.</strong> Log in again to see your followed channels
              (it's one click).
            </span>
          ) : (
            <span>
              <strong>Log in once</strong> to see which channels you follow are live. You can still
              add any channel by name without logging in.
            </span>
          )}
          <LoginButton label={status === 'expired' ? 'Log in again' : undefined} />
        </div>
      ) : (
        <>
          <div className={styles.controls}>
            <input
              className={styles.filter}
              placeholder="Filter channels or games"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter followed channels"
            />
            <select
              className={styles.sort}
              value={sidebarSort}
              onChange={(e) => update({ sidebarSort: e.target.value as SidebarSort })}
              aria-label="Sort live channels"
            >
              <option value="viewers">Viewers</option>
              <option value="name">Name</option>
              <option value="uptime">Newest</option>
            </select>
          </div>
          <div className={styles.list} onScroll={() => setPreview(null)}>
            {others.length > 0 && (
              <>
                <div className={styles.section} title="Streams in this view you don't follow">
                  <span>Also watching · {others.length}</span>
                </div>
                {others.map((row) => (
                  <ChannelRow key={row.login} row={row} inView />
                ))}
              </>
            )}
            <div className={styles.section}>
              <span>Live · {live.isLoading ? '…' : shownLive.length}</span>
              {shownLive.some((r) => !inView.includes(r.login)) && (
                <button
                  className={styles.sectionAction}
                  onClick={() => watchAll(shownLive.map((r) => r.login))}
                  title={
                    filter
                      ? 'Add every live channel matching the filter'
                      : 'Add every live channel you follow'
                  }
                  data-testid="watch-all-live"
                >
                  Watch all
                </button>
              )}
            </div>
            {live.isError && (
              <div className={styles.empty}>Couldn't load live channels: {live.error.message}</div>
            )}
            {live.isSuccess && shownLive.length === 0 && (
              <div className={styles.empty}>
                {filter ? 'No matches.' : 'Nobody you follow is live.'}
              </div>
            )}
            {shownLive.map((row) => (
              <ChannelRow
                key={row.login}
                row={row}
                inView={inView.includes(row.login)}
                onHover={(el) => {
                  if (!el || !row.stream) return setPreview(null);
                  const box = el.getBoundingClientRect();
                  setPreview({
                    stream: row.stream,
                    top: Math.min(box.top, window.innerHeight - 250),
                    left: box.right + 8,
                  });
                }}
              />
            ))}

            <button
              className={styles.section}
              onClick={() => update({ showOfflineFollows: !showOfflineFollows })}
              aria-expanded={showOfflineFollows}
            >
              <span>Offline · {follows.isLoading ? '…' : shownOffline.length}</span>
              {showOfflineFollows ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showOfflineFollows &&
              shownOffline.map((row) => (
                <ChannelRow key={row.login} row={row} inView={inView.includes(row.login)} />
              ))}
          </div>
        </>
      )}

      {preview && (
        <div className={styles.preview} style={{ top: preview.top, left: preview.left }}>
          <img src={sizedThumbnail(preview.stream.thumbnailUrl, 440, 248)} alt="" />
          <div className={styles.previewText}>
            <div>{preview.stream.title}</div>
            <div>
              {preview.stream.gameName} · {formatCount(preview.stream.viewerCount)} viewers · live{' '}
              {formatUptime(preview.stream.startedAt)}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function ChannelRow({
  row,
  inView,
  onHover,
}: {
  row: Row;
  inView: boolean;
  onHover?(el: HTMLElement | null): void;
}) {
  const handlers = useRowHandlers(row.login);
  const favorite = useChannelPrefs((p) => p.favorites.includes(row.login));
  const toggleFavorite = useChannelPrefs((p) => p.toggleFavorite);
  const s = row.stream;
  return (
    <div className={`${styles.rowWrap} ${favorite ? styles.favorite : ''}`}>
      <button
        className={`${styles.row} ${inView ? styles.inView : ''} ${s ? '' : styles.offline}`}
        data-testid="channel-row"
        data-channel={row.login}
        data-live={!!s}
        aria-pressed={inView}
        title={
          (inView ? 'Click to remove' : 'Click to add') +
          ' · Shift+click to watch only this · drag onto a stream to replace it'
        }
        onMouseEnter={(e) => onHover?.(e.currentTarget)}
        onMouseLeave={() => onHover?.(null)}
        {...handlers}
        onClick={(e) => {
          onHover?.(null); // the preview must not cover players while they start
          handlers.onClick(e);
        }}
      >
        <Avatar src={row.avatar} name={row.displayName} size={30} live={!!s} />
        <span className={styles.text}>
          <div className={styles.name}>{row.displayName}</div>
          {s && <div className={styles.game}>{s.gameName || 'No category'}</div>}
        </span>
        {s && (
          <span className={styles.viewers}>
            <span className={styles.dot} />
            {formatCount(s.viewerCount)}
          </span>
        )}
      </button>
      <button
        className={styles.star}
        aria-pressed={favorite}
        aria-label={favorite ? `Unfavorite ${row.displayName}` : `Favorite ${row.displayName}`}
        title={
          favorite ? 'Remove from favorites' : 'Favorite: keep at the top and get go-live alerts'
        }
        data-testid="favorite-toggle"
        onClick={() => toggleFavorite(row.login)}
      >
        <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function CollapsedRail({ onExpand }: { onExpand(): void }) {
  const { liveRows } = useRows();
  const inView = useViewStore((s) => s.view.channels);
  return (
    <nav className={styles.rail} aria-label="Live followed channels">
      <IconButton
        label="Expand sidebar (B)"
        icon={<PanelLeftOpen size={18} />}
        onClick={onExpand}
      />
      {liveRows.map((row) => (
        <RailItem key={row.login} row={row} inView={inView.includes(row.login)} />
      ))}
    </nav>
  );
}

function RailItem({ row, inView }: { row: Row; inView: boolean }) {
  const handlers = useRowHandlers(row.login);
  return (
    <button
      className={`${styles.railItem} ${inView ? styles.inView : ''}`}
      title={`${row.displayName} — ${row.stream?.gameName ?? ''} (${formatCount(row.stream?.viewerCount ?? 0)})`}
      aria-label={row.displayName}
      aria-pressed={inView}
      {...handlers}
    >
      <Avatar src={row.avatar} name={row.displayName} size={34} live />
    </button>
  );
}
