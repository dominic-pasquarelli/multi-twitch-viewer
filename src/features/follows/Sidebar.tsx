import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Heart,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/servicesContext';
import { favoritesFirst } from '@/lib/alerts/goLive';
import type {
  ChannelSearchResult,
  LiveStream,
  TwitchCategory,
  TwitchUser,
} from '@/lib/twitch/types';
import { formatCount, sizedThumbnail } from '@/lib/utils/format';
import { useAuth } from '@/state/authStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useWatchHistory } from '@/state/historyStore';
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
  useCategorySearch,
  useCategoryStreams,
  useChannelSearch,
  useStreamsFor,
  useUsersFor,
  type FollowedChannelInfo,
} from './queries';
import styles from './Sidebar.module.css';
import { useFollowChannel } from './useFollowChannel';
import { ChannelPreview } from './ChannelPreview';
import { useChannelPreview, useRowPreview } from './useChannelPreview';
import {
  matchesChannel,
  partitionChannelRows,
  type ChannelRowInfo as Row,
  type ChannelRowStatus,
} from './channelRows';

const HISTORY_GROUPS: { status: ChannelRowStatus; label: string }[] = [
  { status: 'live', label: 'Live' },
  { status: 'offline', label: 'Offline' },
  { status: 'checking', label: 'Checking' },
];

type ChannelProfile = Pick<TwitchUser, 'login' | 'displayName' | 'profileImageUrl'>;

/** A shared batch keeps photos and stream metadata stable when a row moves. */
function useWatchedMetadata(
  inView: string[],
  follows: FollowedChannelInfo[] | undefined,
  historyEnabled: boolean,
) {
  const entries = useWatchHistory((h) => h.entries);
  const followed = useMemo(() => new Set(follows?.map((f) => f.login)), [follows]);
  const logins = useMemo(
    () =>
      [...new Set([...inView, ...(historyEnabled ? entries.map((e) => e.login) : [])])].filter(
        (login) => !followed.has(login),
      ),
    [inView, entries, followed, historyEnabled],
  );
  const users = useUsersFor(logins);
  const streams = useStreamsFor(logins);
  const queryClient = useQueryClient();
  const wanted = new Set(logins);
  const profiles = new Map<string, ChannelProfile>(
    (users.data ?? [])
      .filter((profile) => wanted.has(profile.login))
      .map((profile) => [profile.login, profile]),
  );
  // Cached searches/history batches bridge changes in the watched login set.
  // Newer metadata wins, while an empty image never erases a loaded photo.
  const cached = [
    ...queryClient.getQueryCache().findAll({ queryKey: ['search'] }),
    ...queryClient.getQueryCache().findAll({ queryKey: ['channel-users'] }),
  ].sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt);
  for (const query of cached) {
    for (const profile of (query.state.data as (TwitchUser | ChannelSearchResult)[] | undefined) ??
      []) {
      if (!wanted.has(profile.login)) continue;
      const previous = profiles.get(profile.login);
      profiles.set(profile.login, {
        login: profile.login,
        displayName: profile.displayName || previous?.displayName || profile.login,
        profileImageUrl: profile.profileImageUrl || previous?.profileImageUrl || '',
      });
    }
  }
  return {
    entries,
    followed,
    profiles,
    live: new Map(streams.data?.map((stream) => [stream.login, stream])),
    known: streams.isSuccess && !streams.isPlaceholderData,
  };
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
  const showHistory = useSettings((s) => s.showHistory);
  const { followed, entries, profiles, live, known } = useWatchedMetadata(
    inView,
    follows,
    showHistory,
  );
  const logins = follows ? inView.filter((l) => !followed.has(l)) : [];
  return logins.map((login) => {
    const stream = live.get(login);
    const profile = profiles.get(login);
    return {
      login,
      displayName:
        stream?.displayName ??
        profile?.displayName ??
        entries.find((entry) => entry.login === login)?.displayName ??
        login,
      avatar: profile?.profileImageUrl ?? '',
      stream,
      liveKnown: known,
    };
  });
}

function ExpandedSidebar({ onCollapse }: { onCollapse(): void }) {
  const status = useAuth((s) => s.status);
  const { api } = useServices();
  const { liveRows, offlineRows, live, follows } = useRows();
  const inView = useViewStore((s) => s.view.channels);
  const { sidebarSort, showOfflineFollows, update } = useSettings();
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'followed' | 'discover'>('followed');
  const { preview, showPreview, hidePreview, onPreviewScroll } = useChannelPreview();
  const queryClient = useQueryClient();

  const match = (r: Row) => matchesChannel(r, filter);
  const shownLive = liveRows.filter(match);
  const shownOffline = offlineRows.filter(match);
  const others = useNotFollowedRows(inView, follows.isSuccess ? follows.data : undefined);

  return (
    <aside
      className={styles.sidebar}
      aria-label={mode === 'followed' ? 'Followed channels' : 'Discover Twitch'}
    >
      <div className={styles.header}>
        <h2>{mode === 'followed' ? 'Followed' : 'Discover'}</h2>
        {api && (
          <IconButton
            size="sm"
            label="Refresh now"
            icon={<RefreshCw size={14} className={live.isFetching ? 'spin' : undefined} />}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['followed-live'] });
              void queryClient.invalidateQueries({ queryKey: ['streams'] });
              void queryClient.invalidateQueries({ queryKey: ['category-streams'] });
            }}
          />
        )}
        <IconButton
          size="sm"
          label="Collapse sidebar (B)"
          icon={<PanelLeftClose size={16} />}
          onClick={onCollapse}
        />
      </div>

      {api && (
        <div className={styles.modes} aria-label="Sidebar mode">
          <button
            aria-pressed={mode === 'followed'}
            onClick={() => {
              setMode('followed');
              hidePreview();
            }}
          >
            Followed
          </button>
          <button
            aria-pressed={mode === 'discover'}
            onClick={() => {
              setMode('discover');
              hidePreview();
            }}
          >
            Discover
          </button>
        </div>
      )}

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
      ) : mode === 'discover' ? (
        <Discovery
          inView={inView}
          onHover={showPreview}
          onDismiss={hidePreview}
          onScroll={onPreviewScroll}
        />
      ) : (
        <>
          <div className={styles.controls}>
            <input
              className={styles.filter}
              placeholder="Name, category, title or tag"
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
          <div className={styles.list} onScroll={onPreviewScroll}>
            {others.length > 0 && (
              <>
                <div className={styles.section} title="Streams in this view you don't follow">
                  <span>Also watching · {others.length}</span>
                </div>
                {others.filter(match).map((row) => (
                  <ChannelRow
                    key={row.login}
                    row={row}
                    inView
                    onHover={(el) => showPreview(row, el)}
                    actions={<FollowButton login={row.login} name={row.displayName} />}
                  />
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
                onHover={(el) => showPreview(row, el)}
              />
            ))}

            <HistorySection inView={inView} filter={match} onHover={showPreview} />

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
                <ChannelRow
                  key={row.login}
                  row={row}
                  inView={inView.includes(row.login)}
                  onHover={(el) => showPreview(row, el)}
                />
              ))}
          </div>
        </>
      )}

      <ChannelPreview preview={preview} />
    </aside>
  );
}

function ChannelRow({
  row,
  inView,
  onHover,
  actions,
}: {
  row: Row;
  inView: boolean;
  onHover?(el: HTMLElement | null): void;
  /** Buttons shown on hover instead of the favorite star (e.g. Follow, Forget). */
  actions?: ReactNode;
}) {
  const handlers = useRowHandlers(row.login);
  const favorite = useChannelPrefs((p) => p.favorites.includes(row.login));
  const toggleFavorite = useChannelPrefs((p) => p.toggleFavorite);
  const s = row.stream;
  const showPreview = useRowPreview(row, onHover);
  return (
    <div
      className={`${styles.rowWrap} ${favorite ? styles.favorite : ''} ${actions ? styles.withActions : ''}`}
    >
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
        onMouseEnter={(e) => showPreview(e.currentTarget)}
        onMouseLeave={() => showPreview(null)}
        onFocus={(e) => showPreview(e.currentTarget)}
        onBlur={() => showPreview(null)}
        {...handlers}
        onClick={(e) => {
          showPreview(null); // the preview must not cover players while they start
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
      {actions ? (
        <div className={styles.actions}>{actions}</div>
      ) : (
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
      )}
    </div>
  );
}

function CollapsedRail({ onExpand }: { onExpand(): void }) {
  const { liveRows, follows } = useRows();
  const inView = useViewStore((s) => s.view.channels);
  const showHistory = useSettings((s) => s.showHistory);
  const others = useNotFollowedRows(inView, follows.isSuccess ? follows.data : undefined);
  const { rows: history } = useHistoryRows(inView, follows.data, showHistory);
  const groups = partitionChannelRows(history);
  const { preview, showPreview, onPreviewScroll } = useChannelPreview();
  return (
    <nav
      className={styles.rail}
      aria-label="Live followed channels and history"
      onScroll={onPreviewScroll}
    >
      <IconButton
        label="Expand sidebar (B)"
        icon={<PanelLeftOpen size={18} />}
        onClick={onExpand}
      />
      <div className={styles.railGroup} role="group" aria-label="Live followed channels">
        {liveRows.map((row) => (
          <RailItem
            key={row.login}
            row={row}
            inView={inView.includes(row.login)}
            onHover={(el) => showPreview(row, el)}
          />
        ))}
      </div>
      {others.length > 0 && (
        <div className={styles.railGroup} role="group" aria-label="Also watching">
          <div className={styles.railSection} title="Also watching" aria-label="Also watching">
            <Eye size={14} />
          </div>
          {others.map((row) => (
            <RailItem key={row.login} row={row} inView onHover={(el) => showPreview(row, el)} />
          ))}
        </div>
      )}
      {showHistory &&
        HISTORY_GROUPS.filter(({ status }) => groups[status].length > 0).map(
          ({ status, label }) => (
            <div
              key={status}
              className={styles.railGroup}
              role="group"
              aria-label={`${label} watch history`}
              data-testid="history-section"
              data-status={status}
            >
              <div className={styles.railSection} title={`History · ${label}`}>
                <History size={14} />
                <span className={styles.railStatus}>{label}</span>
              </div>
              {groups[status].map((row) => (
                <RailItem
                  key={row.login}
                  row={row}
                  inView={false}
                  history
                  onHover={(el) => showPreview(row, el)}
                />
              ))}
            </div>
          ),
        )}
      <ChannelPreview preview={preview} />
    </nav>
  );
}

function RailItem({
  row,
  inView,
  history,
  onHover,
}: {
  row: Row;
  inView: boolean;
  history?: boolean;
  onHover(el: HTMLElement | null): void;
}) {
  const handlers = useRowHandlers(row.login);
  const showPreview = useRowPreview(row, onHover);
  return (
    <button
      className={`${styles.railItem} ${inView ? styles.inView : ''}`}
      title={`${row.displayName}${history ? ' · History' : ''} · ${row.stream ? row.stream.gameName : row.liveKnown === false ? 'Checking live status' : 'Offline'}`}
      data-testid="rail-channel"
      data-channel={row.login}
      data-history={!!history}
      data-live={!!row.stream}
      aria-label={row.displayName}
      aria-pressed={inView}
      {...handlers}
      onMouseEnter={(e) => showPreview(e.currentTarget)}
      onMouseLeave={() => showPreview(null)}
      onFocus={(e) => showPreview(e.currentTarget)}
      onBlur={() => showPreview(null)}
      onClick={(e) => {
        showPreview(null);
        handlers.onClick(e);
      }}
    >
      <Avatar src={row.avatar} name={row.displayName} size={34} live={!!row.stream} />
    </button>
  );
}

/** Follow on Twitch (opens the channel's page; see useFollowChannel). */
function FollowButton({ login, name }: { login: string; name: string }) {
  const { canFollow, follow } = useFollowChannel();
  if (!canFollow(login)) return null;
  return (
    <button
      className={styles.rowAction}
      title={`Follow ${name} on Twitch`}
      aria-label={`Follow ${name}`}
      data-testid="follow-button"
      onClick={() => void follow(login)}
    >
      <Heart size={14} />
    </button>
  );
}

/** Channels you watched without following them, newest first. */
function useHistoryRows(
  inView: string[],
  follows: FollowedChannelInfo[] | undefined,
  enabled: boolean,
) {
  const { entries, followed, profiles, live, known } = useWatchedMetadata(inView, follows, enabled);
  const shown = useMemo(
    () => entries.filter((e) => !inView.includes(e.login) && !followed.has(e.login)),
    [entries, inView, followed],
  );
  const rows: Row[] = shown.map((e) => ({
    login: e.login,
    displayName:
      live.get(e.login)?.displayName ?? profiles.get(e.login)?.displayName ?? e.displayName,
    avatar: profiles.get(e.login)?.profileImageUrl ?? '',
    stream: live.get(e.login),
    liveKnown: known,
  }));
  return { rows, count: shown.length };
}

function HistorySection({
  inView,
  filter,
  onHover,
}: {
  inView: string[];
  filter: (r: Row) => boolean;
  onHover(row: Row, el: HTMLElement | null): void;
}) {
  const { showHistory, update } = useSettings();
  const follows = useFollowedChannels();
  const { rows: history, count } = useHistoryRows(inView, follows.data, showHistory);
  const rows = history.filter(filter);
  const groups = partitionChannelRows(rows);
  if (!count) return null;
  return (
    <>
      <div className={styles.section}>
        <button
          className={styles.sectionToggle}
          onClick={() => update({ showHistory: !showHistory })}
          aria-expanded={showHistory}
          title="Channels you watched without following them"
        >
          <History size={12} /> History · {rows.length}
          {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showHistory && (
          <button
            className={styles.sectionAction}
            onClick={() => useWatchHistory.getState().clear()}
            data-testid="history-clear"
          >
            Clear
          </button>
        )}
      </div>
      {showHistory &&
        HISTORY_GROUPS.filter(({ status }) => status !== 'checking' || groups.checking.length).map(
          ({ status, label }) => (
            <section
              key={status}
              aria-label={`${label} watch history`}
              data-testid="history-section"
              data-status={status}
            >
              <div className={`${styles.section} ${styles.historyStatus}`}>
                <span>
                  {label} · {groups[status].length}
                </span>
              </div>
              {groups[status].map((row) => (
                <div key={row.login} data-testid="history-row" data-channel={row.login}>
                  <ChannelRow
                    row={row}
                    inView={false}
                    onHover={(el) => onHover(row, el)}
                    actions={
                      <>
                        <FollowButton login={row.login} name={row.displayName} />
                        <button
                          className={styles.rowAction}
                          title="Remove from history"
                          aria-label={`Remove ${row.displayName} from history`}
                          onClick={() => useWatchHistory.getState().forget(row.login)}
                        >
                          <X size={14} />
                        </button>
                      </>
                    }
                  />
                </div>
              ))}
            </section>
          ),
        )}
    </>
  );
}

function useDebouncedQuery(value: string) {
  const [query, setQuery] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return query;
}

/** Twitch discovery is separate from filtering your own followed/history list. */
function Discovery({
  inView,
  onHover,
  onDismiss,
  onScroll,
}: {
  inView: string[];
  onHover(row: Row, el: HTMLElement | null): void;
  onDismiss(): void;
  onScroll(): void;
}) {
  const [kind, setKind] = useState<'channels' | 'categories'>('categories');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<TwitchCategory | null>(null);
  const [filter, setFilter] = useState('');
  const query = useDebouncedQuery(text.trim());
  const channels = useChannelSearch(kind === 'channels' ? query : '');
  const categories = useCategorySearch(kind === 'categories' && !category ? query : '');
  const categoryStreams = useCategoryStreams(category?.id ?? '');
  const streams = useMemo(() => {
    const unique = new Map<string, LiveStream>();
    for (const page of categoryStreams.data?.pages ?? []) {
      for (const stream of page.streams) unique.set(stream.login, stream);
    }
    return [...unique.values()];
  }, [categoryStreams.data]);
  const foundChannels = kind === 'channels' ? (channels.data ?? []) : [];
  const liveLogins = foundChannels.filter((c) => c.isLive).map((c) => c.login);
  const channelStreams = useStreamsFor(liveLogins);
  const streamsByLogin = new Map(channelStreams.data?.map((s) => [s.login, s]));
  const users = useUsersFor(category ? streams.map((s) => s.login) : []);
  const profiles = new Map(users.data?.map((u) => [u.login, u]));
  const rows: Row[] = category
    ? streams.map((s) => ({
        login: s.login,
        displayName: s.displayName,
        avatar: profiles.get(s.login)?.profileImageUrl ?? '',
        stream: s,
      }))
    : foundChannels.map((c) => ({
        login: c.login,
        displayName: c.displayName,
        avatar: c.profileImageUrl,
        stream: streamsByLogin.get(c.login),
        liveKnown: !c.isLive || channelStreams.isSuccess,
      }));
  const shown = rows.filter((row) => matchesChannel(row, filter));
  const search = kind === 'channels' ? channels : categories;

  return (
    <>
      <div className={styles.discoveryControls}>
        <div className={styles.modes} aria-label="Discover by">
          {(['categories', 'channels'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setCategory(null);
                setFilter('');
                onDismiss();
              }}
            >
              {value === 'categories' ? 'Categories' : 'Channels'}
            </button>
          ))}
        </div>
        {category ? (
          <>
            <button
              className={styles.categoryBack}
              onClick={() => {
                setCategory(null);
                setFilter('');
                onDismiss();
              }}
            >
              ← Back to categories
            </button>
            <strong>{category.name}</strong>
            <input
              className={styles.filter}
              placeholder="Name, title, tag or language"
              aria-label="Filter loaded category streams"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                onDismiss();
              }}
            />
            <div className={styles.discoveryHint}>
              Filters the {streams.length} loaded live streams. Load more to widen the results.
            </div>
          </>
        ) : (
          <>
            <input
              className={styles.filter}
              placeholder={
                kind === 'categories' ? 'Find a game or category' : 'Find a Twitch channel'
              }
              aria-label={
                kind === 'categories' ? 'Search Twitch categories' : 'Search Twitch channels'
              }
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onDismiss();
              }}
            />
            <div className={styles.discoveryHint}>
              {kind === 'categories'
                ? 'Choose a category to browse its live streams.'
                : 'Search channel names, including offline channels.'}
            </div>
          </>
        )}
      </div>
      <div className={styles.list} onScroll={onScroll}>
        {!category && query.length < 2 && (
          <div className={styles.empty}>Enter at least two characters to search Twitch.</div>
        )}
        {!category && query.length >= 2 && search.isPending && (
          <div className={styles.empty}>Searching Twitch…</div>
        )}
        {!category && search.isError && (
          <div className={styles.empty}>Couldn't search Twitch: {search.error.message}</div>
        )}
        {!category && query.length >= 2 && search.isSuccess && !search.data.length && (
          <div className={styles.empty}>No {kind} match this search.</div>
        )}
        {!category &&
          kind === 'categories' &&
          categories.data?.map((result) => (
            <button
              key={result.id}
              className={styles.categoryRow}
              data-testid="category-result"
              onClick={() => {
                setCategory(result);
                setFilter('');
                onDismiss();
              }}
            >
              <img src={sizedThumbnail(result.boxArtUrl, 52, 72)} alt="" loading="lazy" />
              <span>
                {result.name}
                <small>Browse live streams</small>
              </span>
            </button>
          ))}
        {category && categoryStreams.isPending && (
          <div className={styles.empty}>Loading live streams…</div>
        )}
        {category && categoryStreams.isError && (
          <div className={styles.empty}>
            Couldn't load this category: {categoryStreams.error.message}
          </div>
        )}
        {category && categoryStreams.isSuccess && !shown.length && (
          <div className={styles.empty}>
            {filter
              ? 'No loaded streams match this filter.'
              : 'No streams are live in this category.'}
          </div>
        )}
        {shown.map((row) => (
          <ChannelRow
            key={row.login}
            row={row}
            inView={inView.includes(row.login)}
            onHover={(el) => onHover(row, el)}
            actions={<FollowButton login={row.login} name={row.displayName} />}
          />
        ))}
        {category && categoryStreams.hasNextPage && (
          <button
            className={styles.loadMore}
            onClick={() => void categoryStreams.fetchNextPage()}
            disabled={categoryStreams.isFetchingNextPage}
          >
            {categoryStreams.isFetchingNextPage ? 'Loading…' : 'Load more live streams'}
          </button>
        )}
      </div>
    </>
  );
}
