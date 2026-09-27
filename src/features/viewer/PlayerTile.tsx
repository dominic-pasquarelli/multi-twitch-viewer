import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ExternalLink,
  GripVertical,
  MessageSquare,
  Maximize2,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import type { Rect } from '@/lib/layout';
import { PlayerController } from '@/lib/player/PlayerController';
import { pickQualityForHeight } from '@/lib/player/quality';
import type { PlayerStatus } from '@/lib/player/types';
import { formatCount } from '@/lib/utils/format';
import { useUi } from '@/state/uiStore';
import { IconButton } from '@/ui/Button';
import { playerRegistry } from './playerRegistry';
import { nudgeVolume, VOLUME_STEP } from './volume';
import styles from './PlayerTile.module.css';

export interface PlayerTileProps {
  login: string;
  displayName: string;
  viewers?: number;
  rect: Rect;
  /** The stream you're focused on (full volume, highlighted). */
  audible: boolean;
  /** Muted entirely (solo mode, or everything muted). */
  muted: boolean;
  /** Volume multiplier, e.g. 0.2 for background streams in duck mode. */
  volumeScale: number;
  /** The channel's remembered volume (null = leave the player's own). */
  volume: number | null;
  isMain: boolean;
  showMainButton: boolean;
  fitQuality: boolean;
  belowMinimum: boolean;
  status: PlayerStatus | undefined;
  dropTarget: boolean;
  dragging: boolean;
  onToggleAudio(login: string): void;
  onVolume(login: string, volume: number): void;
  onRemove(login: string): void;
  onMakeMain(login: string): void;
  onOpenChat(login: string): void;
  onExternalMute(login: string, muted: boolean): void;
  onStatus(login: string, status: PlayerStatus | null): void;
  onDragStart(login: string, e: ReactPointerEvent): void;
}

/**
 * One stream. The player is created once per mount and then only steered
 * (mute/volume/quality) — never re-created — so streams don't restart.
 */
/** Volume actually sent to the player: the channel's volume times the duck scale. */
const effectiveVolume = (volume: number | null, scale: number): number | null =>
  volume === null ? (scale === 1 ? null : 0.5 * scale) : volume * scale;

export const PlayerTile = memo(function PlayerTile(props: PlayerTileProps) {
  const { login, rect, audible, muted, volume, volumeScale, status } = props;
  const { playerFactory } = useServices();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Create the player (and re-create on "reload").
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const p = latest.current;
    // Start muted so autoplay is allowed; the controller unmutes once ready.
    const adapter = playerFactory.create(host, { channel: login, muted: true });
    const controller = new PlayerController(
      adapter,
      { muted: p.muted, volume: effectiveVolume(p.volume, p.volumeScale), quality: null },
      {
        onStatus: (s) => latest.current.onStatus(login, s),
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

  // Brief "volume 65%" readout after wheel/keyboard changes.
  const flash = useUi((s) => (s.volumeFlash?.login === login ? s.volumeFlash.n : 0));
  const [showHud, setShowHud] = useState(false);
  useEffect(() => {
    if (!flash) return;
    setShowHud(true);
    const t = setTimeout(() => setShowHud(false), 900);
    return () => clearTimeout(t);
  }, [flash]);

  // Optional: match the stream quality to the tile size (saves bandwidth/CPU).
  const { fitQuality } = props;
  useEffect(() => {
    const entry = playerRegistry.get(login);
    if (!entry) return;
    if (!fitQuality) {
      entry.controller.update({ quality: null });
      return;
    }
    if (status !== 'playing') return;
    const t = setTimeout(() => {
      const q = pickQualityForHeight(
        entry.adapter.getQualities(),
        rect.height,
        window.devicePixelRatio,
      );
      entry.controller.update({ quality: q });
    }, 800);
    return () => clearTimeout(t);
  }, [login, fitQuality, status, rect.height]);

  const classes = [
    styles.tile,
    audible && styles.audible,
    props.dropTarget && styles.dropTarget,
    props.dragging && styles.dragging,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid="player-tile"
      data-channel={login}
      data-audible={audible}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      // The video itself is an iframe (it keeps its own wheel events), so this
      // works over the name and control bars that appear on hover.
      onWheel={(e) => {
        if (e.deltaY !== 0) nudgeVolume(login, e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP);
      }}
      onMouseLeave={() => {
        // Clicking inside a player gives it keyboard focus; hand focus back to
        // the app when the pointer leaves so the shortcuts keep working.
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && hostRef.current?.contains(active)) active.blur();
      }}
    >
      <div ref={hostRef} key={reloadKey} className={styles.host} />

      {status === 'blocked' && (
        <div className={styles.overlay}>
          <IconButton
            label="Play"
            icon={<Play size={28} />}
            onClick={() => {
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

      {showHud && (
        <div className={styles.hud} data-testid="volume-hud">
          {muted ? 'Muted · ' : ''}Volume {Math.round((volume ?? 0.5) * 100)}%
          {volumeScale !== 1 && !muted ? ` (background ${Math.round(volumeScale * 100)}%)` : ''}
        </div>
      )}

      <div className={`${styles.bar} ${styles.left}`}>
        <span
          className={styles.grip}
          onPointerDown={(e) => props.onDragStart(login, e)}
          title="Drag onto another stream to swap places"
        >
          <GripVertical size={16} />
        </span>
        <span className={styles.name}>
          {props.displayName}
          {props.viewers !== undefined && (
            <span className={styles.meta}>{formatCount(props.viewers)}</span>
          )}
          {status === 'offline' && <span className={styles.meta}>offline</span>}
        </span>
      </div>

      <div className={`${styles.bar} ${styles.right}`}>
        <IconButton
          size="sm"
          label={audible ? 'Stop listening (M mutes all)' : 'Listen to this stream'}
          active={audible}
          icon={muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          onClick={() => props.onToggleAudio(login)}
        />
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={100}
          value={Math.round((volume ?? 0.5) * 100)}
          aria-label={`${props.displayName} volume`}
          title="Volume — or scroll over this bar; ↑/↓ change the stream you're hearing"
          onChange={(e) => props.onVolume(login, Number(e.target.value) / 100)}
        />
        {props.showMainButton && !props.isMain && (
          <IconButton
            size="sm"
            label="Make this the main stream"
            icon={<Maximize2 size={15} />}
            onClick={() => props.onMakeMain(login)}
          />
        )}
        <IconButton
          size="sm"
          label="Show chat"
          icon={<MessageSquare size={15} />}
          onClick={() => props.onOpenChat(login)}
        />
        <IconButton
          size="sm"
          label="Reload player"
          icon={<RotateCw size={15} />}
          onClick={() => setReloadKey((k) => k + 1)}
        />
        <IconButton
          size="sm"
          label="Open on Twitch"
          icon={<ExternalLink size={15} />}
          onClick={() => window.open(`https://www.twitch.tv/${login}`, '_blank', 'noopener')}
        />
        <IconButton
          size="sm"
          label="Remove"
          icon={<X size={16} />}
          onClick={() => props.onRemove(login)}
        />
      </div>
    </div>
  );
});
