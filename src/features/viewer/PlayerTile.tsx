import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Play } from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import type { Rect } from '@/lib/layout';
import { PlayerController } from '@/lib/player/PlayerController';
import { pickQuality, type QualityChoice } from '@/lib/player/quality';
import type { PlayerStatus } from '@/lib/player/types';
import { useUi } from '@/state/uiStore';
import { IconButton } from '@/ui/Button';
import { AutoResume } from './autoResume';
import { CHANNEL_MIME, setDragging } from './dnd';
import { markInteraction, pausedByUser } from './playerInteraction';
import { playerRegistry } from './playerRegistry';
import { playbackRecovery } from './playbackRecovery';
import { StreamControls } from './StreamControls';
import styles from './PlayerTile.module.css';

export interface PlayerTileProps {
  login: string;
  rect: Rect;
  /** The stream you're focused on (full volume, highlighted). */
  audible: boolean;
  /** The one large visible video in focus mode. */
  main: boolean;
  /** Muted entirely (solo mode, or everything muted). */
  muted: boolean;
  /** Volume multiplier, e.g. 0.2 for background streams in duck mode. */
  volumeScale: number;
  /** The channel's remembered volume (null = leave the player's own). */
  volume: number | null;
  /** Which quality to ask for (depends on whether it's the main stream). */
  quality: QualityChoice;
  belowMinimum: boolean;
  status: PlayerStatus | undefined;
  /** Last targeted stream, retained for keyboard volume adjustments. */
  selected: boolean;
  /** Paused and hidden while another group tab is selected. */
  hidden: boolean;
  arranging: boolean;
  dropTarget: boolean;
  onVolume(login: string, volume: number): void;
  onExternalMute(login: string, muted: boolean): void;
  onStatus(login: string, status: PlayerStatus | null): void;
  onSelect(login: string): void;
}

/** Volume actually sent to the player: the channel's volume times the duck scale. */
const effectiveVolume = (volume: number | null, scale: number): number | null =>
  volume === null ? (scale === 1 ? null : 0.5 * scale) : volume * scale;

/**
 * One full-size video with compact hover controls. The player rectangle stays
 * at its native aspect ratio, so controls do not create letterbox padding.
 *
 * The player is created once per mount and then only steered
 * (mute/volume/quality), never re-created, so streams don't restart.
 */
export const PlayerTile = memo(function PlayerTile(props: PlayerTileProps) {
  const { login, rect, audible, muted, volume, volumeScale, status } = props;
  const { playerFactory } = useServices();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const reloadKey = useUi((s) => s.reloadRequests[login] ?? 0);
  const [adjustingVolume, setAdjustingVolume] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Group tabs keep players mounted. Clear transient hover before a hidden
  // tile can be shown again with the pointer somewhere else.
  if (props.hidden && hovered) setHovered(false);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Cross-origin players can swallow their parent's pointer boundary events.
  // A transparent entry surface takes the first movement, then is removed so
  // the iframe stays interactive. Parent movement and viewport exits clear
  // hover after the pointer leaves the frame.
  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const clearHover = () => {
      setHovered(false);
      const active = document.activeElement;
      if (active instanceof HTMLIFrameElement && hostRef.current?.contains(active)) active.blur();
    };
    const isInside = (event: MouseEvent) => {
      const box = hostRef.current?.getBoundingClientRect();
      return (
        !!box &&
        event.clientX >= box.left &&
        event.clientX < box.right &&
        event.clientY >= box.top &&
        event.clientY < box.bottom
      );
    };
    const onParentMove = (event: PointerEvent) => {
      if (!isInside(event)) clearHover();
    };
    const onViewportLeave = (event: MouseEvent) => {
      // Crossing into the child browsing context can look like leaving the
      // parent document even though the pointer is still over this video.
      if (!isInside(event)) clearHover();
    };
    const onBlur = () => {
      clearTimeout(blurTimer);
      // Focus moving into the child iframe also blurs this window. Clear only
      // when the containing document actually loses focus to another window.
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) clearHover();
      }, 0);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') clearHover();
    };
    window.addEventListener('blur', onBlur);
    document.documentElement.addEventListener('mouseleave', onViewportLeave);
    document.addEventListener('pointermove', onParentMove, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(blurTimer);
      window.removeEventListener('blur', onBlur);
      document.documentElement.removeEventListener('mouseleave', onViewportLeave);
      document.removeEventListener('pointermove', onParentMove, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Keyboard volume shortcuts briefly reveal only the adjusted stream's bar.
  // Subscribe to the event instead of keeping it open for a stored selection.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useUi.subscribe((state, previous) => {
      if (state.volumeFlash === previous.volumeFlash || state.volumeFlash?.login !== login) return;
      clearTimeout(timer);
      setAdjustingVolume(true);
      timer = setTimeout(() => setAdjustingVolume(false), 1400);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [login]);

  // Create the player (and re-create on "reload").
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const p = latest.current;
    const autoResume = new AutoResume();
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    // Start muted so autoplay is allowed; the controller unmutes once ready.
    const adapter = playerFactory.create(host, { channel: login, muted: true });
    const controller = new PlayerController(
      adapter,
      { muted: p.muted, volume: effectiveVolume(p.volume, p.volumeScale), quality: null },
      {
        onStatus: (s) => {
          latest.current.onStatus(login, s);
          playbackRecovery.observeStatus(login, s, pausedByUser(login));
          // Keep streams playing unless you paused them yourself.
          clearTimeout(resumeTimer);
          if (
            s === 'paused' &&
            !latest.current.hidden &&
            !playbackRecovery.isManagedPause(login) &&
            autoResume.shouldResume(pausedByUser(login))
          ) {
            resumeTimer = setTimeout(() => {
              if (
                controller.status === 'paused' &&
                !latest.current.hidden &&
                !pausedByUser(login) &&
                !playbackRecovery.isManagedPause(login)
              )
                adapter.play();
            }, 600);
          }
        },
        onExternalMute: (m) => {
          // Muting a quiet background stream in duck mode doesn't change focus.
          if (!m || latest.current.audible) latest.current.onExternalMute(login, m);
        },
        // Undo the duck scale so the remembered volume stays the "full" one.
        onExternalVolume: (v) =>
          latest.current.onVolume(login, Math.min(1, v / (latest.current.volumeScale || 1))),
      },
    );
    controllerRef.current = controller;
    playerRegistry.set(login, { adapter, controller });
    const poll = setInterval(() => controller.sync(), 1000);
    return () => {
      clearInterval(poll);
      clearTimeout(resumeTimer);
      controller.dispose();
      adapter.destroy();
      if (playerRegistry.get(login)?.controller === controller) playerRegistry.delete(login);
      controllerRef.current = null;
      latest.current.onStatus(login, null);
    };
  }, [login, playerFactory, reloadKey]);

  useEffect(() => {
    controllerRef.current?.update({ muted });
  }, [muted]);

  useEffect(() => {
    if (volume === null && volumeScale !== 1) {
      // About to play quieter: first remember the stream's own volume, so it
      // can go back to exactly that when it becomes the focused stream.
      const entry = playerRegistry.get(login);
      latest.current.onVolume(login, entry?.controller.isReady ? entry.adapter.getVolume() : 0.5);
      return;
    }
    const v = effectiveVolume(volume, volumeScale);
    if (v !== null) controllerRef.current?.update({ volume: v });
  }, [login, volume, volumeScale]);

  // Quality: e.g. source for the main stream, sized to the tile for the rest.
  const { quality } = props;
  useEffect(() => {
    const entry = playerRegistry.get(login);
    if (!entry || props.hidden) return;
    if (quality === 'auto') {
      entry.controller.update({ quality: null });
      return;
    }
    // The list of qualities is only known once the stream plays.
    if (status !== 'playing') return;
    const t = setTimeout(() => {
      const q = pickQuality(
        entry.adapter.getQualities(),
        quality,
        rect.height,
        window.devicePixelRatio,
      );
      entry.controller.update({ quality: q });
    }, 800);
    return () => clearTimeout(t);
  }, [login, quality, status, rect.height, props.hidden]);

  const classes = [
    styles.tile,
    hovered && styles.hovered,
    audible && styles.audible,
    props.dropTarget && styles.dropTarget,
    props.hidden && styles.hidden,
  ]
    .filter(Boolean)
    .join(' ');

  const enterHover = (event: { buttons: number }) => {
    // Remove the entry surface before the next pointer down. The iframe itself
    // stays interactive, so its native hit-test surface is already registered.
    flushSync(() => setHovered(true));
    if (event.buttons === 0) props.onSelect(login);
  };

  return (
    <div
      className={classes}
      data-testid="player-tile"
      data-channel={login}
      data-audible={audible}
      data-main={props.main}
      data-selected={props.selected}
      data-hovered={hovered}
      data-hidden={props.hidden}
      data-arranging={props.arranging}
      aria-hidden={props.hidden || undefined}
      tabIndex={props.hidden ? -1 : 0}
      aria-label={`${login} stream`}
      onFocus={() => props.onSelect(login)}
      draggable={props.arranging && !props.hidden}
      onDragStart={(e) => {
        if (!props.arranging || (e.target as Element).closest('button, input, a')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData(CHANNEL_MIME, login);
        e.dataTransfer.effectAllowed = 'copy';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      data-status={status ?? 'loading'}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onPointerEnter={enterHover}
      onMouseEnter={enterHover}
      onMouseLeave={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX >= box.left &&
          event.clientX < box.right &&
          event.clientY >= box.top &&
          event.clientY < box.bottom
        )
          return;
        setHovered(false);
        // Clicking inside a player gives it keyboard focus; hand focus back to
        // the app when the pointer leaves so the shortcuts keep working.
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && hostRef.current?.contains(active)) active.blur();
      }}
    >
      <div
        className={`${styles.toolbar} ${adjustingVolume ? styles.adjustingVolume : ''}`}
        data-tile-toolbar
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <StreamControls login={login} main={props.main} />
      </div>
      <div
        ref={hostRef}
        key={reloadKey}
        className={styles.host}
        data-player-host
        // Players that are part of the page (mock mode) report clicks here;
        // real Twitch players are iframes, detected via focus in the Viewer.
        onPointerDown={() => markInteraction(login)}
      />

      {!hovered && !props.hidden && !props.arranging && (
        <div className={styles.hoverEntry} data-player-entry aria-hidden="true" />
      )}

      {props.arranging && !props.hidden && (
        <div
          className={styles.arrangeSurface}
          draggable
          data-testid="arrange-surface"
          aria-label={`Drag ${login} onto another stream to swap places`}
          title={`Drag ${login} onto another stream to swap places`}
        >
          <span>Drag to arrange</span>
        </div>
      )}

      {status === 'blocked' && !props.hidden && !props.arranging && (
        <div className={styles.overlay}>
          <IconButton
            label="Play"
            icon={<Play size={28} />}
            onClick={() => {
              playbackRecovery.allowManualPlay(login);
              const entry = playerRegistry.get(login);
              entry?.adapter.play();
              entry?.controller.reapply();
            }}
          />
          <p>
            {props.belowMinimum
              ? 'This tile is below Twitch’s 400×300 autoplay size — click to play.'
              : 'Autoplay was blocked — click to play.'}
          </p>
        </div>
      )}
    </div>
  );
});
