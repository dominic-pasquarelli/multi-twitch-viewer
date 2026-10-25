import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search } from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import { musicSuggestion } from '@/lib/music/discovery';
import { useAuth } from '@/state/authStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useMusicDiscovery } from '@/state/musicDiscoveryStore';
import { useMusicStore } from '@/state/musicStore';
import { Button } from '@/ui/Button';
import { useFollowedChannels, useTwitchFollowedLive } from '../follows/queries';
import formStyles from '@/ui/Form.module.css';
import styles from './MusicChannelPicker.module.css';

type Filter = 'suggested' | 'all' | 'favorites';

export function MusicChannelPicker() {
  const { api } = useServices();
  const userId = useAuth((s) => s.user?.id);
  const follows = useFollowedChannels();
  const live = useTwitchFollowedLive();
  const favorites = useChannelPrefs((s) => s.favorites);
  const music = useMusicStore();
  const discovery = useMusicDiscovery();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('suggested');
  const [limit, setLimit] = useState(50);
  const ids = useMemo(() => (follows.data ?? []).map((c) => c.id).sort(), [follows.data]);
  const info = useQuery({
    queryKey: ['music-channel-info', userId, ids],
    queryFn: () => api!.getChannelInformation(ids),
    enabled: !!api && !!userId && ids.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  useEffect(() => {
    if (userId && info.data) useMusicDiscovery.getState().observe(userId, info.data);
  }, [userId, info.data]);

  const channels = useMemo(() => {
    const liveById = new Map(
      (live.isPlaceholderData ? [] : (live.data ?? [])).map((s) => [s.userId, s]),
    );
    const infoById = new Map((info.data ?? []).map((c) => [c.id, c]));
    const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return (follows.data ?? [])
      .map((c) => {
        const stream = liveById.get(c.id);
        const category = stream?.gameName ?? infoById.get(c.id)?.gameName;
        const suggestion = musicSuggestion(
          stream,
          infoById.get(c.id),
          discovery.userId === userId ? discovery.seen[c.id] : undefined,
        );
        return { ...c, stream, category, suggestion };
      })
      .filter(
        (c) =>
          (filter !== 'suggested' || c.suggestion) &&
          (filter !== 'favorites' || favorites.includes(c.login)) &&
          words.every((word) =>
            `${c.login} ${c.displayName} ${c.category ?? ''}`.toLocaleLowerCase().includes(word),
          ),
      )
      .sort(
        (a, b) =>
          Number(!!b.stream) - Number(!!a.stream) || a.displayName.localeCompare(b.displayName),
      );
  }, [
    follows.data,
    live.data,
    live.isPlaceholderData,
    info.data,
    search,
    filter,
    favorites,
    discovery.userId,
    discovery.seen,
    userId,
  ]);
  const loading = !!api && !!userId && (follows.isPending || (ids.length > 0 && info.isPending));
  const error = follows.isError || info.isError || live.isError;
  return (
    <section className={styles.picker} aria-label="Choose music channels">
      <h3>Find your DJs</h3>
      <p>Choose from channels you follow. Add them to your music order one at a time.</p>
      <div className={styles.filters} role="group" aria-label="Music channel filters">
        {(
          [
            ['suggested', 'Music & DJs'],
            ['all', 'All followed'],
            ['favorites', 'Followed favorites'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="small"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setLimit(50);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <input
          className={formStyles.input}
          aria-label="Search followed music channels"
          type="search"
          placeholder="Search name or category"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(50);
          }}
        />
      </label>
      {(!api || !userId) && (
        <p role="status">Sign in to Twitch to choose from your followed channels.</p>
      )}
      {loading && <small role="status">Finding followed channels and categories…</small>}
      {error && (
        <div className={styles.error} role="status">
          <span>
            Some channel information is unavailable. You can still choose from loaded follows or add
            a name.
          </span>
          <Button
            size="small"
            onClick={() => {
              void follows.refetch();
              void live.refetch();
              if (ids.length) void info.refetch();
            }}
          >
            Retry channel lookup
          </Button>
        </div>
      )}
      <ul className={styles.results} aria-label="Music channel choices" aria-busy={loading}>
        {channels.slice(0, limit).map((c) => {
          const added = music.channels.includes(c.login);
          return (
            <li key={c.id} data-testid="music-choice" data-channel={c.login}>
              {c.profileImageUrl && <img src={c.profileImageUrl} alt="" loading="lazy" />}
              <div className={styles.name}>
                <strong title={c.displayName}>{c.displayName}</strong>
                <small>
                  {c.stream
                    ? 'Live'
                    : live.isSuccess && !live.isPlaceholderData
                      ? 'Offline'
                      : 'Status unavailable'}
                  {c.category ? ` · ${c.category}` : ''}
                </small>
                {c.suggestion && <span className={styles.suggestion}>{c.suggestion}</span>}
              </div>
              <Button
                size="small"
                aria-label={
                  added ? `${c.displayName} is in music order` : `Add ${c.displayName} to music`
                }
                disabled={added || music.channels.length >= 50}
                onClick={() => music.addChannels([c.login])}
              >
                {added ? <Check size={14} /> : <Plus size={14} />}
                {added ? 'Added' : 'Add'}
              </Button>
            </li>
          );
        })}
      </ul>
      {!loading && api && userId && !channels.length && (
        <p role="status">
          {search
            ? 'No channels match your search.'
            : filter === 'suggested'
              ? 'No Music or DJs suggestions yet. Try All followed to choose any channel.'
              : filter === 'favorites'
                ? 'No followed favorites found. Try All followed.'
                : 'No followed channels found.'}
        </p>
      )}
      {channels.length > limit && (
        <Button size="small" onClick={() => setLimit(limit + 50)}>
          Show more channels ({channels.length - limit} remaining)
        </Button>
      )}
      <small>
        Suggestions use current or last categories, plus Music and DJs categories this app has seen
        on this device. They are not a complete stream history.
      </small>
      {music.channels.length >= 50 && (
        <small role="status">
          Your music order is full (50 channels). Remove one to add another.
        </small>
      )}
    </section>
  );
}
