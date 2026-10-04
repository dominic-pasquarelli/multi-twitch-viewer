import {
  ExternalLink,
  Heart,
  Maximize2,
  MessageSquare,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { audioLevel, mainChannel } from '@/lib/view/operations';
import { streamSections } from '@/lib/view/groups';
import { formatCount } from '@/lib/utils/format';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { useFollowChannel } from '../follows/useFollowChannel';
import { currentVolume, setStreamMix, useVolumeModel, VOLUME_STEP } from './volume';
import styles from './StreamControls.module.css';

/**
 * Tile controls occupy their own reserved space above the video, so they never
 * cover the Twitch iframe. Mix sliders adjust just this channel's balance.
 */
export function StreamControls({ login }: { login: string }) {
  const view = useViewStore((s) => s.view);
  const duckLevel = useSettings((s) => s.duckLevel);
  const volumeModel = useVolumeModel();
  const live = useLiveStatus(view.channels).live;
  const { canFollow, follow } = useFollowChannel();
  const flashN = useUi((s) => (s.volumeFlash?.login === login ? s.volumeFlash.n : 0));
  const store = useViewStore.getState();
  const stream = live.get(login);
  const level = audioLevel(view, login, duckLevel);
  const volume = currentVolume(login, volumeModel);
  const peers =
    streamSections(view).find((section) => section.channels.includes(login))?.channels ??
    view.channels;
  const isMain = view.layout.mode === 'focus' && mainChannel(view, peers) === login;

  return (
    <div
      className={styles.controls}
      data-testid="stream-controls"
      data-channel={login}
      onWheel={(e) => {
        if (e.deltaY === 0 || !(e.target instanceof HTMLInputElement)) return;
        setStreamMix(
          login,
          Math.max(0, Math.min(1, volume + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP))),
        );
        useUi.getState().flashVolume(login);
      }}
    >
      <div className={styles.heading}>
        <div className={styles.chip} data-testid="stream-chip">
          <span className={styles.name}>{stream?.displayName ?? login}</span>
          {stream && (
            <span className={styles.meta} title="Viewers">
              {formatCount(stream.viewerCount)}
            </span>
          )}
        </div>
        <IconButton
          size="sm"
          label={level.focused ? 'Stop listening (M mutes all)' : 'Listen to this stream'}
          active={level.focused}
          icon={level.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          onClick={() => store.toggleAudio(login)}
        />
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label={`${stream?.displayName ?? login} volume`}
          title="This stream's mix volume (scroll to adjust)"
          onChange={(e) => setStreamMix(login, Number(e.target.value) / 100)}
        />
        <span
          key={flashN} // replays the highlight animation on every change
          className={`${styles.percent} ${flashN ? styles.flash : ''}`}
          data-testid="stream-volume"
        >
          {Math.round(volume * 100)}%
        </span>
      </div>
      <div className={styles.actions}>
        {view.channels.length > 1 && !isMain && (
          <IconButton
            size="sm"
            label="Make this the main stream"
            icon={<Maximize2 size={15} />}
            onClick={() => store.setMain(login)}
          />
        )}
        <IconButton
          size="sm"
          label={view.chat.open && view.chat.channel === login ? 'Hide chat' : 'Show chat'}
          active={view.chat.open && view.chat.channel === login}
          icon={<MessageSquare size={15} />}
          onClick={() =>
            store.setChat({
              open: !(view.chat.open && view.chat.channel === login),
              channel: login,
            })
          }
        />
        <IconButton
          size="sm"
          label="Reload player"
          icon={<RotateCw size={15} />}
          onClick={() => useUi.getState().reloadPlayer(login)}
        />
        <IconButton
          size="sm"
          label="Open on Twitch"
          icon={<ExternalLink size={15} />}
          onClick={() => window.open(`https://www.twitch.tv/${login}`, '_blank', 'noopener')}
        />
        {canFollow(login) && (
          <IconButton
            size="sm"
            label="Follow on Twitch"
            icon={<Heart size={15} />}
            onClick={() => void follow(login)}
            data-testid="stream-follow"
          />
        )}
        <IconButton
          size="sm"
          label="Remove"
          icon={<X size={16} />}
          onClick={() => {
            store.removeChannel(login);
            toast(`Removed ${login}`, {
              action: { label: 'Undo', run: () => useViewStore.getState().undo() },
            });
          }}
        />
      </div>
    </div>
  );
}
