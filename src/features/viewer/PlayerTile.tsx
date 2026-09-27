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
import { IconButton } from '@/ui/Button';
import { playerRegistry } from './playerRegistry';
import styles from './PlayerTile.module.css';

export interface PlayerTileProps {
  login: string;
  displayName: string;
  viewers?: number;
  rect: Rect;
  audible: boolean;
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
export const PlayerTile = memo(function PlayerTile(props: PlayerTileProps) {
  const { login, rect, audible, volume, status } = props;
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
      { muted: !p.audible, volume: p.volume, quality: null },
      {
        onStatus: (s) => latest.current.onStatus(login, s),
        onExternalMute: (m) => latest.current.onExternalMute(login, m),
        onExternalVolume: (v) => latest.current.onVolume(login, v),
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
    controllerRef.current?.update({ muted: !audible });
  }, [audible]);

  useEffect(() => {
    if (volume !== null) controllerRef.current?.update({ volume });
  }, [volume]);

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
          label={audible ? 'Mute (M mutes all)' : 'Listen to this stream'}
          active={audible}
          icon={audible ? <Volume2 size={16} /> : <VolumeX size={16} />}
          onClick={() => props.onToggleAudio(login)}
        />
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={100}
          value={Math.round((volume ?? 0.5) * 100)}
          aria-label={`${props.displayName} volume`}
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
