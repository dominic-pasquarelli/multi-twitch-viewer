import { memo, useEffect, useLayoutEffect, useRef } from 'react';
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

/** Space reserved above every iframe, including when hover controls are hidden. */
export const PLAYER_CONTROLS_HEIGHT = 64;

export interface PlayerTileProps {
  login: string;
  rect: Rect;
  /** The stream you're focused on (full volume, highlighted). */
  audible: boolean;
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
  /** Its controls are shown in the top bar. */
  selected: boolean;
  /** Paused and hidden while another group tab is selected. */
  hidden: boolean;
  /** Mixer levels stay visible on every tile. */
  mixing: boolean;
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
 * One stream with a reserved controls bar above its iframe. Controls never
 * cover video; Arrange mode explicitly enables a drag surface over the player.
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
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

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
        Math.max(0, rect.height - PLAYER_CONTROLS_HEIGHT),
        window.devicePixelRatio,
      );
      entry.controller.update({ quality: q });
    }, 800);
    return () => clearTimeout(t);
  }, [login, quality, status, rect.height, props.hidden]);

  const classes = [
    styles.tile,
    props.selected && styles.selected,
    audible && styles.audible,
    props.dropTarget && styles.dropTarget,
    props.mixing && styles.mixing,
    props.hidden && styles.hidden,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid="player-tile"
      data-channel={login}
      data-audible={audible}
      data-selected={props.selected}
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
      onMouseEnter={(e) => {
        // Not while a button is held: that's a drag from the top-bar controls.
        if (e.buttons === 0) props.onSelect(login);
      }}
      onMouseLeave={() => {
        // Clicking inside a player gives it keyboard focus; hand focus back to
        // the app when the pointer leaves so the shortcuts keep working.
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && hostRef.current?.contains(active)) active.blur();
      }}
    >
      <div className={styles.toolbar} data-tile-toolbar>
        <StreamControls login={login} />
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
