import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
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
import { toast } from '@/state/toastStore';
import { Button } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { CHANNEL_MIME, setDragging } from './dnd';
import { EmptyState } from './EmptyState';
import { PlayerTile } from './PlayerTile';
import { useElementSize } from './useElementSize';
import styles from './Viewer.module.css';

interface DragState {
  login: string;
  pointerId: number;
  target: string | null;
}

export function Viewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  const view = useViewStore((s) => s.view);
  const actions = useViewStore.getState();
  const { tileGap, hideOffline, qualityMode, duckLevel } = useSettings();
  const volumes = useChannelPrefs((s) => s.volumes);
  const playerStatus = useUi((s) => s.playerStatus);
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
  const main = mainChannel(view, visible);

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

  // ---- Drag a tile onto another to swap them ---------------------------------
  const [drag, setDrag] = useState<DragState | null>(null);
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

  const onTileDragStart = useCallback((login: string, e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Pointer capture keeps events flowing to us even over player iframes.
    containerRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    setDrag({ login, pointerId: e.pointerId, target: null });
  }, []);

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const target = slotAt(toLocal(e));
    if (target !== drag.target) setDrag({ ...drag, target });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDragging(false);
    containerRef.current?.releasePointerCapture(e.pointerId);
    if (drag.target && drag.target !== drag.login) actions.swapChannels(drag.login, drag.target);
    setDrag(null);
  };

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
  const onRemove = useCallback((login: string) => {
    useViewStore.getState().removeChannel(login);
    toast(`Removed ${login}`, {
      action: { label: 'Undo', run: () => useViewStore.getState().undo() },
    });
  }, []);
  const onToggleAudio = useCallback((l: string) => useViewStore.getState().toggleAudio(l), []);
  const onMakeMain = useCallback((l: string) => useViewStore.getState().setMain(l), []);
  const onOpenChat = useCallback(
    (l: string) => useViewStore.getState().setChat({ open: true, channel: l }),
    [],
  );
  const onExternalMute = useCallback(
    (l: string, m: boolean) => useViewStore.getState().externalMuteChange(l, m),
    [],
  );
  const onStatus = useCallback(
    (l: string, s: PlayerStatus | null) => setPlayerStatus(l, s),
    [setPlayerStatus],
  );

  const hiddenOffline = hiding ? offline : [];

  return (
    <div
      ref={containerRef}
      className={styles.viewer}
      data-testid="viewer"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setSidebarDrop(null);
      }}
      onDrop={onDrop}
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
        const stream = liveStatus.live.get(login);
        const level = audioLevel(view, login, duckLevel);
        return (
          <PlayerTile
            key={login}
            login={login}
            displayName={stream?.displayName ?? login}
            viewers={stream?.viewerCount}
            rect={rect}
            audible={level.focused}
            muted={level.muted}
            volumeScale={level.scale}
            volume={volumes[login] ?? null}
            isMain={view.layout.mode === 'focus' && login === main}
            showMainButton={view.channels.length > 1}
            fitQuality={qualityMode === 'fit'}
            belowMinimum={isBelowMinimum(rect, options.minTile)}
            status={playerStatus[login]}
            dropTarget={drag?.target === login || sidebarDrop?.target === login}
            dragging={drag?.login === login}
            onToggleAudio={onToggleAudio}
            onVolume={setVolume}
            onRemove={onRemove}
            onMakeMain={onMakeMain}
            onOpenChat={onOpenChat}
            onExternalMute={onExternalMute}
            onStatus={onStatus}
            onDragStart={onTileDragStart}
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
