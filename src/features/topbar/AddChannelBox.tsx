import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  channelName,
  kickChannelId,
  kickSlugFromId,
  parseKickSlug,
  parseChannelInput,
  type ChannelPlatform,
} from '@/lib/channels/parseChannels';
import { useServices } from '@/app/servicesContext';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useWatchHistory } from '@/state/historyStore';
import { KickBadge } from '../kick/KickBadge';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { toast } from '@/state/toastStore';
import { Avatar } from '@/ui/Avatar';
import {
  useChannelSearch,
  useFollowedChannels,
  useFollowedLive,
  useKickChannelLookup,
  useKickLive,
} from '../follows/queries';
import styles from './AddChannelBox.module.css';

interface Suggestion {
  login: string;
  displayName: string;
  detail: string;
  avatar: string;
  live: boolean;
  platform?: ChannelPlatform;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Type a name (or several, or paste twitch/multitwitch links) and press
 * Enter. Suggestions come from your follows first, then Twitch search.
 */
export function AddChannelBox() {
  const { kickApi } = useServices();
  const [platform, setPlatform] = useState<ChannelPlatform>('twitch');
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Enter only picks a suggestion after you've moved to one with the arrow keys. */
  const [navigated, setNavigated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusRequest = useUi((s) => s.addBoxFocusRequest);
  const inView = useViewStore((s) => s.view.channels);
  const favorites = useChannelPrefs((s) => s.favorites);
  const history = useWatchHistory((s) => s.entries);

  useEffect(() => {
    if (focusRequest) inputRef.current?.focus();
  }, [focusRequest]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const query = text.trim().toLowerCase();
  const parsed = parseChannelInput(text, platform);
  const directKick = parsed.length === 1 ? kickSlugFromId(parsed[0]!) : null;
  const isSingleName = platform === 'twitch' && !directKick && /^@?[a-z0-9_]*$/i.test(query);
  const lookupName = directKick ?? parseKickSlug(query);
  const scoped = `${platform}\n${query}`;
  const debounced = useDebounced(scoped, 250);
  const search = useChannelSearch(isSingleName && debounced === scoped ? query : '');
  const lookup = useKickChannelLookup(debounced === scoped ? lookupName : null);
  const kickLive = useKickLive();
  const live = useFollowedLive();
  const follows = useFollowedChannels();

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!query || (!isSingleName && !directKick && !lookupName)) return [];
    const q = query.replace(/^@/, '');
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (s: Suggestion) => {
      if (seen.has(s.login) || inView.includes(s.login)) return;
      seen.add(s.login);
      out.push(s);
    };
    if (directKick) {
      if (lookup.data?.slug === directKick)
        push({
          login: kickChannelId(directKick),
          displayName: directKick,
          detail: lookup.data.isLive
            ? lookup.data.categoryName || 'Live on Kick'
            : 'Offline on Kick',
          avatar: '',
          live: lookup.data.isLive,
          platform: 'kick',
        });
      for (const id of [...favorites, ...history.map((e) => e.login)]) {
        const slug = kickSlugFromId(id);
        if (!slug?.includes(directKick)) continue;
        const stream = kickLive.get(id);
        push({
          login: id,
          displayName: channelName(id),
          detail:
            stream?.gameName || (favorites.includes(id) ? 'Kick favorite' : 'Watched on Kick'),
          avatar: '',
          live: !!stream,
          platform: 'kick',
        });
      }
      return out.slice(0, 10);
    }
    const avatars = new Map((follows.data ?? []).map((f) => [f.login, f.profileImageUrl]));
    for (const s of live.data ?? []) {
      if (s.login.includes(q) || s.displayName.toLowerCase().includes(q))
        push({
          login: s.login,
          displayName: s.displayName,
          detail: s.gameName,
          avatar: avatars.get(s.login) ?? '',
          live: true,
          platform: s.platform,
        });
    }
    for (const f of follows.data ?? []) {
      if (f.login.includes(q))
        push({
          login: f.login,
          displayName: f.displayName,
          detail: 'Followed',
          avatar: f.profileImageUrl,
          live: false,
        });
    }
    for (const r of search.data ?? []) {
      push({
        login: r.login,
        displayName: r.displayName,
        detail: r.isLive ? r.gameName : 'Offline',
        avatar: r.profileImageUrl,
        live: r.isLive,
      });
    }
    // An exact Kick match is secondary. Enter still adds Twitch unless the
    // user explicitly selects Kick, its result, a link or a prefixed name.
    if (
      lookup.data &&
      lookup.data.slug === lookupName &&
      !inView.includes(kickChannelId(lookup.data.slug))
    ) {
      return [
        ...out.slice(0, 9),
        {
          login: kickChannelId(lookup.data.slug),
          displayName: lookup.data.slug,
          detail: lookup.data.isLive
            ? lookup.data.categoryName || 'Live on Kick'
            : 'Offline on Kick',
          avatar: '',
          live: lookup.data.isLive,
          platform: 'kick' as const,
        },
      ];
    }
    return out.slice(0, 10);
  }, [
    query,
    isSingleName,
    directKick,
    lookupName,
    lookup.data,
    favorites,
    history,
    kickLive,
    live.data,
    follows.data,
    search.data,
    inView,
  ]);

  const add = (logins: string[]) => {
    if (!logins.length) {
      toast('Enter a Twitch name, a Kick name with Kick selected, or a channel link.', {
        tone: 'error',
      });
      return;
    }
    useViewStore.getState().addChannels(logins);
    setText('');
    setOpen(false);
    setActive(0);
    setNavigated(false);
  };

  const submit = () => {
    const pick = suggestions[active];
    if (pick && open && navigated) add([pick.login]);
    else if (directKick && lookup.isSuccess && !lookup.data)
      toast(`No Kick channel found for “${directKick}”. Check the username.`, { tone: 'error' });
    else add(parsed);
  };

  return (
    <div className={styles.wrap}>
      <select
        className={styles.platform}
        aria-label="Stream platform"
        value={platform}
        onChange={(e) => {
          setPlatform(e.target.value as ChannelPlatform);
          setActive(0);
          setNavigated(false);
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <option value="twitch">Twitch</option>
        <option value="kick">Kick</option>
      </select>
      <Search size={16} className={styles.icon} />
      <input
        ref={inputRef}
        className={styles.input}
        data-testid="add-channel"
        placeholder={platform === 'kick' ? 'Kick username or link…' : 'Add channels…  (/)'}
        aria-label="Add channels by name or link"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          setNavigated(false);
        }}
        onFocus={() => {
          clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => {
            if (document.activeElement !== inputRef.current) setOpen(false);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (navigated ? Math.min(i + 1, suggestions.length - 1) : 0));
            setNavigated(true);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          const logins = parseChannelInput(pasted, platform);
          if (logins.length > 1 || /twitch|multi|kick\.com|^kick:/i.test(pasted)) {
            e.preventDefault();
            add(logins);
          }
        }}
      />
      {open && query && (
        <div className={styles.menu} role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={s.login}
              role="option"
              aria-selected={navigated && i === active}
              className={`${styles.item} ${navigated && i === active ? styles.active : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add([s.login])}
            >
              <Avatar src={s.avatar} name={s.displayName} size={26} live={s.live} />
              <span className={styles.itemText}>
                {s.displayName}
                <small>{s.detail}</small>
              </span>
              {s.platform === 'kick' && <KickBadge />}
              {s.live && <span className={styles.badge}>LIVE</span>}
            </button>
          ))}
          <div className={styles.hint}>
            {directKick ? (
              <>
                {inView.includes(kickChannelId(directKick))
                  ? 'This Kick channel is already open.'
                  : !kickApi
                    ? 'Enter opens Kick directly. Set up Kick in Settings → Account for username lookup and live status.'
                    : debounced !== scoped || lookup.isPending
                      ? 'Looking up this exact Kick username…'
                      : lookup.isError
                        ? 'Kick lookup is unavailable. Enter still opens the channel directly.'
                        : !lookup.data
                          ? 'No Kick channel found. Check the exact username.'
                          : 'Enter opens this Kick channel. Twitch remains your default platform.'}
              </>
            ) : (
              <>
                Enter adds Twitch “{text.trim()}” · Kick matches appear below when available · use
                kick:name or a channel link · separate names with spaces or commas
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
