import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { parseChannelInput } from '@/lib/channels/parseChannels';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { toast } from '@/state/toastStore';
import { Avatar } from '@/ui/Avatar';
import { useChannelSearch, useFollowedChannels, useFollowedLive } from '../follows/queries';
import styles from './AddChannelBox.module.css';

interface Suggestion {
  login: string;
  displayName: string;
  detail: string;
  avatar: string;
  live: boolean;
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
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Enter only picks a suggestion after you've moved to one with the arrow keys. */
  const [navigated, setNavigated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusRequest = useUi((s) => s.addBoxFocusRequest);
  const inView = useViewStore((s) => s.view.channels);

  useEffect(() => {
    if (focusRequest) inputRef.current?.focus();
  }, [focusRequest]);

  const query = text.trim().toLowerCase();
  const isSingleName = /^@?[a-z0-9_]*$/i.test(query);
  const debounced = useDebounced(isSingleName ? query : '', 250);
  const search = useChannelSearch(debounced);
  const live = useFollowedLive();
  const follows = useFollowedChannels();

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!query || !isSingleName) return [];
    const q = query.replace(/^@/, '');
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (s: Suggestion) => {
      if (seen.has(s.login) || inView.includes(s.login)) return;
      seen.add(s.login);
      out.push(s);
    };
    const avatars = new Map((follows.data ?? []).map((f) => [f.login, f.profileImageUrl]));
    for (const s of live.data ?? []) {
      if (s.login.includes(q) || s.displayName.toLowerCase().includes(q))
        push({
          login: s.login,
          displayName: s.displayName,
          detail: s.gameName,
          avatar: avatars.get(s.login) ?? '',
          live: true,
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
    return out.slice(0, 10);
  }, [query, isSingleName, live.data, follows.data, search.data, inView]);

  const add = (logins: string[]) => {
    if (!logins.length) {
      toast('That doesn’t look like a Twitch channel name.', { tone: 'error' });
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
    else add(parseChannelInput(text));
  };

  return (
    <div className={styles.wrap}>
      <Search size={16} className={styles.icon} />
      <input
        ref={inputRef}
        className={styles.input}
        data-testid="add-channel"
        placeholder="Add channels…  (/)"
        aria-label="Add channels by name or link"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          setNavigated(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
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
          const logins = parseChannelInput(pasted);
          if (logins.length > 1 || /twitch|multi/i.test(pasted)) {
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
              {s.live && <span className={styles.badge}>LIVE</span>}
            </button>
          ))}
          <div className={styles.hint}>
            Enter adds “{text.trim()}” · separate several names with spaces or commas · links work
            too
          </div>
        </div>
      )}
    </div>
  );
}
