import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { DEFAULT_LAYOUT_OPTIONS, isBelowMinimum, rectIndexAt, type Point } from '@/lib/layout';
import { desktop } from '@/lib/desktop/bridge';
import type { PlayerStatus } from '@/lib/player/types';
import type { ViewState } from '@/lib/view/types';
import { streamVolume } from '@/lib/audio/volumeModel';
import { audioLevel, mainChannel } from '@/lib/view/operations';
import { displayedChannels, streamSections } from '@/lib/view/groups';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { CHANNEL_MIME, setDragging } from './dnd';
import { markInteraction } from './playerInteraction';
import { playerRegistry } from './playerRegistry';
import { playbackRecovery } from './playbackRecovery';
import { usePlaybackRecovery } from './usePlaybackRecovery';
import { computeGroupedLayout } from './groupedLayout';
import { EmptyState } from './EmptyState';
import { PlayerTile } from './PlayerTile';
import { useElementSize } from './useElementSize';
import { setStreamVolume, useVolumeModel } from './volume';
import styles from './Viewer.module.css';

/** Closes any reachable stream surface consistently, with Undo. */
function closeStream(login: string) {
  if (!useSettings.getState().rightClickCloses) return;
  const store = useViewStore.getState();
  if (!store.view.channels.includes(login)) return;
  store.removeChannel(login);
  toast(`Closed ${login}`, {
    action: { label: 'Undo', run: () => useViewStore.getState().undo() },
  });
}

/** The stream that gets the main-stream quality: the big one in focus layout, else the one you hear. */
const isPrimary = (view: ViewState, login: string, channels: string[]) =>
  view.layout.mode === 'focus'
    ? mainChannel(view, channels) === login
    : view.audio.active.includes(login);

export function Viewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  const view = useViewStore((s) => s.view);
  const actions = useViewStore.getState();
  const { tileGap, hideOffline, mainQuality, otherQuality, duckLevel, clickToFocus } =
    useSettings();
  const volumeModel = useVolumeModel();
  const playerStatus = useUi((s) => s.playerStatus);
  const selected = useUi((s) => s.selected);
  const setSelected = useUi((s) => s.setSelected);
  const arranging = useUi((s) => s.arranging);
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
  const groupChannels = useMemo(() => displayedChannels(view), [view]);
  const shown = useMemo(() => displayedChannels(view, visible), [view, visible]);
  const sections = useMemo(() => streamSections(view, visible), [view, visible]);
  const hidden = useMemo(
    () => new Set(view.channels.filter((c) => !groupChannels.includes(c))),
    [view.channels, groupChannels],
  );
  const muted = useMemo(
    () =>
      new Set(
        view.channels.filter(
          (login) =>
            audioLevel(view, login, duckLevel).muted || streamVolume(volumeModel, login) === 0,
        ),
      ),
    [view, duckLevel, volumeModel],
  );
  const focused =
    view.layout.mode === 'focus'
      ? mainChannel(view, shown)
      : (view.audio.active.find((c) => shown.includes(c)) ?? shown[0] ?? null);
  const recovery = usePlaybackRecovery({
    channels: view.channels,
    focused,
    muted,
    hidden,
    status: playerStatus,
  });
  const options = useMemo(
    () => ({
      ...DEFAULT_LAYOUT_OPTIONS,
      gap: tileGap,
    }),
    [tileGap],
  );
  const recoveryBannerHeight = recovery.degraded ? 26 : 0;
  const geometry = useMemo(() => {
    const result = computeGroupedLayout(
      view,
      sections,
      { ...size, height: Math.max(0, size.height - recoveryBannerHeight) },
      options,
    );
    if (recoveryBannerHeight) {
      result.sections.forEach((section) => {
        section.rect = { ...section.rect, y: section.rect.y + recoveryBannerHeight };
      });
      result.tiles.forEach((rect, login) =>
        result.tiles.set(login, { ...rect, y: rect.y + recoveryBannerHeight }),
      );
      result.rects = result.order.map((login) => result.tiles.get(login)!);
    }
    return result;
  }, [view, sections, size, options, recoveryBannerHeight]);
  const { order, rects } = geometry;

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
  const setPlayerStatus = useUi((s) => s.setPlayerStatus);
  const onExternalMute = useCallback(
    (l: string, m: boolean) => useViewStore.getState().externalMuteChange(l, m),
    [],
  );
  const onStatus = useCallback(
    (l: string, s: PlayerStatus | null) => setPlayerStatus(l, s),
    [setPlayerStatus],
  );

  // ---- Click a stream: main one (focus layout) or the one you hear (grid) ---
  const promote = useCallback((login: string, statusAtClick?: PlayerStatus) => {
    // A click on a stopped stream is a click on its play button: let it play
    // where it is. Click it again (while playing) to make it the main one.
    if ((statusAtClick ?? useUi.getState().playerStatus[login]) !== 'playing') return;
    const store = useViewStore.getState();
    const { view } = store;
    if (view.layout.mode === 'focus') {
      if (mainChannel(view) === login) return;
      store.setMain(login);
    } else {
      // Grid, Solo or Duck: clicking a stream makes it the one you hear.
      if (view.audio.mode === 'mix' || view.audio.active.includes(login)) return;
      store.focusAudio(login);
    }
    // Clicking a Twitch video also pauses it; keep the stream playing.
    setTimeout(() => {
      playbackRecovery.allowManualPlay(login);
      if (!playbackRecovery.isManagedPause(login)) playerRegistry.get(login)?.adapter.play();
    }, 400);
  }, []);
  useEffect(() => {
    // Clicks inside a player's iframe never reach the page, but they move the
    // keyboard focus into that iframe and blur the window, which we can see.
    const onBlur = () => {
      // Before the click can change it (a click on a paused player plays it).
      const statuses = { ...useUi.getState().playerStatus };
      setTimeout(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLIFrameElement)) return;
        const login = el.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel;
        if (!login) return;
        markInteraction(login); // a pause right after this is yours: don't undo it
        if (useSettings.getState().clickToFocus) promote(login, statuses[login]);
      }, 0);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [promote]);
  // Right-click a stream to close it. Clicks inside real players are
  // reported by the desktop app; mock players are part of the page.
  useEffect(() => desktop?.onPlayerContextMenu?.(closeStream), []);
  const onViewerContextMenu = (e: ReactMouseEvent) => {
    const target = e.target as Element;
    if (!useSettings.getState().rightClickCloses) return;
    const login = target.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel;
    if (!login) return;
    e.preventDefault();
    closeStream(login);
  };
  const onViewerClick = (e: ReactMouseEvent) => {
    // Players that are part of the page (mock mode) report clicks directly.
    if (!clickToFocus) return;
    const target = e.target as Element;
    if (!target.closest('[data-player-host]')) return;
    const login = target.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel;
    if (login) promote(login);
  };

  const hiddenOffline = hiding ? offline.filter((c) => groupChannels.includes(c)) : [];
  const selectedGroup = view.groups?.find((g) => g.id === view.activeGroup);

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
      onContextMenu={onViewerContextMenu}
    >
      {view.channels.length === 0 && <EmptyState />}
      {selectedGroup && groupChannels.length === 0 && (
        <EmptyState
          title={`No streams in ${selectedGroup.name}`}
          action={<span>Add streams with Manage groups above.</span>}
        />
      )}
      {groupChannels.length > 0 && shown.length === 0 && (
        <EmptyState
          title={`All ${groupChannels.length} channels in ${selectedGroup?.name ?? 'this view'} are offline`}
          action={<Button onClick={() => setShowOffline(true)}>Show them anyway</Button>}
        />
      )}

      {!!view.groups?.length &&
        geometry.sections.map((section) => (
          <div
            key={section.id}
            className={styles.sectionLabel}
            style={{ left: section.rect.x, top: section.rect.y, width: section.rect.width }}
            data-testid="stream-section"
            data-group={section.id}
          >
            {section.name} <span>{section.channels.length}</span>
          </div>
        ))}

      {renderOrder.map((login) => {
        if (!hidden.has(login) && !geometry.tiles.has(login)) return null;
        const rect = geometry.tiles.get(login) ?? { x: 0, y: 0, width: 534, height: 300 };
        const sectionChannels =
          sections.find((section) => section.channels.includes(login))?.channels ?? shown;
        const level = audioLevel(view, login, duckLevel);
        return (
          <PlayerTile
            key={login}
            login={login}
            rect={rect}
            audible={level.focused}
            muted={level.muted}
            volumeScale={level.scale}
            volume={streamVolume(volumeModel, login)}
            quality={isPrimary(view, login, sectionChannels) ? mainQuality : otherQuality}
            belowMinimum={isBelowMinimum(rect, DEFAULT_LAYOUT_OPTIONS.minTile)}
            status={playerStatus[login]}
            selected={selected === login}
            hidden={hidden.has(login)}
            arranging={arranging}
            dropTarget={sidebarDrop?.target === login}
            onVolume={setStreamVolume}
            onExternalMute={onExternalMute}
            onStatus={onStatus}
            onSelect={setSelected}
          />
        );
      })}

      {arranging && (
        <div className={styles.arrangeHint}>
          Drag a stream onto another to swap.{' '}
          <button onClick={() => useUi.getState().setArranging(false)}>Done</button>
        </div>
      )}
      {recovery.degraded && (
        <div className={styles.recoveryHint} role="status">
          Connection recovery: background quality reduced
          {recovery.pausedForBandwidth.length
            ? ` · ${recovery.pausedForBandwidth.length} muted streams paused`
            : ''}
        </div>
      )}

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
