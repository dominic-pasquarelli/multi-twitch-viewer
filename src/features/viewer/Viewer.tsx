import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  computeLayout,
  DEFAULT_LAYOUT_OPTIONS,
  isBelowMinimum,
  rectIndexAt,
  type Point,
} from '@/lib/layout';
import type { PlayerStatus } from '@/lib/player/types';
import { audioLevel, mainChannel, slotOrder } from '@/lib/view/operations';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { CHANNEL_MIME, setDragging } from './dnd';
import { markInteraction } from './playerInteraction';
import { playerRegistry } from './playerRegistry';
import { EmptyState } from './EmptyState';
import { PlayerTile } from './PlayerTile';
import { useElementSize } from './useElementSize';
import styles from './Viewer.module.css';

export function Viewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  const view = useViewStore((s) => s.view);
  const actions = useViewStore.getState();
  const { tileGap, hideOffline, qualityMode, duckLevel, clickToFocus } = useSettings();
  const volumes = useChannelPrefs((s) => s.volumes);
  const playerStatus = useUi((s) => s.playerStatus);
  const selected = useUi((s) => s.selected);
  const setSelected = useUi((s) => s.setSelected);
  const [showOffline, setShowOffline] = useState(false);
  const liveStatus = useLiveStatus(view.channels);

  // Channels shown as tiles: offline ones collapse (if enabled) so live ones get the space.
  const offline = useMemo(
    () =>
      liveStatus.known
        ? view.channels.filter((c) => !liveStatus.live.has(c) && playerStatus[c] !== 'playing')
        : [],
    [view.channels, liveStatus, playerStatus],
  );
  const hiding = hideOffline && !showOffline;
  const visible = useMemo(
    () => (hiding ? view.channels.filter((c) => !offline.includes(c)) : view.channels),
    [hiding, view.channels, offline],
  );
  const order = useMemo(() => slotOrder(view, visible), [view, visible]);

  const options = useMemo(() => ({ ...DEFAULT_LAYOUT_OPTIONS, gap: tileGap }), [tileGap]);
  const rects = useMemo(
    () =>
      computeLayout({
        mode: view.layout.mode,
        count: order.length,
        container: size,
        options,
        mainScale: view.layout.mainScale,
      }),
    [view.layout.mode, view.layout.mainScale, order.length, size, options],
  );

  // Render tiles in a fixed (alphabetical) DOM order, never in slot order:
  // moving an iframe in the DOM reloads it, so reordering only moves rects.
  // Adding or removing a tile never moves its siblings either.
  const renderOrder = useMemo(() => [...visible].sort(), [visible]);

  // ---- Hit-testing helpers --------------------------------------------------
  const toLocal = (e: { clientX: number; clientY: number }): Point => {
    const box = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const slotAt = useCallback(
    (p: Point) => {
      const i = rectIndexAt(rects, p);
      return i >= 0 ? (order[i] ?? null) : null;
    },
    [rects, order],
  );

  // ---- Drop a channel from the sidebar ---------------------------------------
  const [sidebarDrop, setSidebarDrop] = useState<{ target: string | null } | null>(null);
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(CHANNEL_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const target = slotAt(toLocal(e));
    if (sidebarDrop?.target !== target || !sidebarDrop) setSidebarDrop({ target });
  };
  const onDrop = (e: DragEvent) => {
    const login = e.dataTransfer.getData(CHANNEL_MIME);
    setSidebarDrop(null);
    setDragging(false);
    if (!login) return;
    e.preventDefault();
    const target = slotAt(toLocal(e));
    if (target && target !== login) actions.replaceChannel(target, login);
    else actions.addChannels([login]);
  };

  // ---- Tile callbacks (stable, so memoised tiles don't re-render) -----------
  const setVolume = useChannelPrefs((s) => s.setVolume);
  const setPlayerStatus = useUi((s) => s.setPlayerStatus);
  const onExternalMute = useCallback(
    (l: string, m: boolean) => useViewStore.getState().externalMuteChange(l, m),
    [],
  );
  const onStatus = useCallback(
    (l: string, s: PlayerStatus | null) => setPlayerStatus(l, s),
    [setPlayerStatus],
  );

  // ---- Click a small stream to make it the main one (focus layout) ---------
  const promote = useCallback((login: string) => {
    const store = useViewStore.getState();
    if (store.view.layout.mode !== 'focus' || mainChannel(store.view) === login) return;
    store.setMain(login);
    // Clicking a Twitch video also pauses it; keep the new main stream playing.
    setTimeout(() => playerRegistry.get(login)?.adapter.play(), 400);
  }, []);
  useEffect(() => {
    // Clicks inside a player's iframe never reach the page, but they move the
    // keyboard focus into that iframe and blur the window, which we can see.
    const onBlur = () =>
      setTimeout(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLIFrameElement)) return;
        const login = el.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel;
        if (!login) return;
        markInteraction(login); // a pause right after this is yours: don't undo it
        if (useSettings.getState().clickToFocus) promote(login);
      }, 0);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [promote]);
  const onViewerClick = (e: ReactMouseEvent) => {
    // Players that are part of the page (mock mode) report clicks directly.
    if (!clickToFocus) return;
    const target = e.target as Element;
    if (!target.closest('[data-player-host]')) return;
    const login = target.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel;
    if (login) promote(login);
  };

  const hiddenOffline = hiding ? offline : [];

  return (
    <div
      ref={containerRef}
      className={styles.viewer}
      data-testid="viewer"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setSidebarDrop(null);
      }}
      onDrop={onDrop}
      onClick={onViewerClick}
    >
      {view.channels.length === 0 && <EmptyState />}
      {view.channels.length > 0 && visible.length === 0 && (
        <EmptyState
          title={`All ${view.channels.length} channels in this view are offline`}
          action={<Button onClick={() => setShowOffline(true)}>Show them anyway</Button>}
        />
      )}

      {renderOrder.map((login) => {
        const slot = order.indexOf(login);
        const rect = rects[slot];
        if (!rect) return null;
        const level = audioLevel(view, login, duckLevel);
        return (
          <PlayerTile
            key={login}
            login={login}
            rect={rect}
            audible={level.focused}
            muted={level.muted}
            volumeScale={level.scale}
            volume={volumes[login] ?? null}
            fitQuality={qualityMode === 'fit'}
            belowMinimum={isBelowMinimum(rect, options.minTile)}
            status={playerStatus[login]}
            selected={selected === login}
            dropTarget={sidebarDrop?.target === login}
            onVolume={setVolume}
            onExternalMute={onExternalMute}
            onStatus={onStatus}
            onSelect={setSelected}
          />
        );
      })}

      {sidebarDrop && !sidebarDrop.target && <div className={styles.dropAdd} />}
      {sidebarDrop && (
        <div className={styles.dropHint}>
          {sidebarDrop.target ? `Replace ${sidebarDrop.target}` : 'Add to view'}
        </div>
      )}

      {(hiddenOffline.length > 0 || (showOffline && offline.length > 0)) && (
        <div className={styles.offlineBar} data-testid="offline-bar">
          {showOffline ? (
            <span>Showing offline channels</span>
          ) : (
            <span>
              Offline, hidden until live: <b>{hiddenOffline.join(', ')}</b>
            </span>
          )}
          <Button size="small" variant="ghost" onClick={() => setShowOffline((v) => !v)}>
            {showOffline ? 'Hide' : 'Show'}
          </Button>
        </div>
      )}
    </div>
  );
}
