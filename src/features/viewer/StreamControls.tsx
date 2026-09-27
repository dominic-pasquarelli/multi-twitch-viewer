import {
  ExternalLink,
  GripVertical,
  Maximize2,
  MessageSquare,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { audioLevel, mainChannel } from '@/lib/view/operations';
import { formatCount } from '@/lib/utils/format';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { CHANNEL_MIME, setDragging } from './dnd';
import { currentVolume, nudgeVolume, setStreamVolume, useVolumeModel, VOLUME_STEP } from './volume';
import styles from './StreamControls.module.css';

/**
 * Controls for the stream you last hovered, shown in the top bar instead of on
 * top of the video (Twitch players can pause when something covers them).
 * Drag the name onto another stream to swap them.
 */
export function StreamControls() {
  const selected = useUi((s) => s.selected);
  const view = useViewStore((s) => s.view);
  const duckLevel = useSettings((s) => s.duckLevel);
  const volumeModel = useVolumeModel();
  const live = useLiveStatus(view.channels).live;
  const flashN = useUi((s) => (s.volumeFlash?.login === selected ? s.volumeFlash.n : 0));

  if (!selected || !view.channels.includes(selected)) return null;
  const login = selected;
  const store = useViewStore.getState();
  const stream = live.get(login);
  const level = audioLevel(view, login, duckLevel);
  const volume = currentVolume(login, volumeModel);
  const isMain = view.layout.mode === 'focus' && mainChannel(view) === login;

  return (
    <div
      className={styles.controls}
      data-testid="stream-controls"
      onWheel={(e) => {
        if (e.deltaY !== 0) nudgeVolume(login, e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP);
      }}
    >
      <div
        className={styles.chip}
        draggable
        data-testid="stream-chip"
        title="Drag onto another stream to swap places"
        onDragStart={(e) => {
          e.dataTransfer.setData(CHANNEL_MIME, login);
          // Same effect the viewer accepts for sidebar drops (it swaps if already on screen).
          e.dataTransfer.effectAllowed = 'copy';
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
      >
        <GripVertical size={14} />
        <span className={styles.name}>{stream?.displayName ?? login}</span>
        {stream && <span className={styles.meta}>{formatCount(stream.viewerCount)}</span>}
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
        title="Volume (scroll here, or ↑/↓ for the stream you're hearing)"
        onChange={(e) => setStreamVolume(login, Number(e.target.value) / 100)}
      />
      <span
        key={flashN} // replays the highlight animation on every change
        className={`${styles.percent} ${flashN ? styles.flash : ''}`}
        data-testid="stream-volume"
      >
        {Math.round(volume * 100)}%
      </span>
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
        label="Show chat"
        icon={<MessageSquare size={15} />}
        onClick={() => store.setChat({ open: true, channel: login })}
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
  );
}
