import {
  LayoutGrid,
  Columns3,
  Maximize,
  Minimize,
  MessageSquare,
  Presentation,
  Settings,
  Keyboard,
  Play,
  Pause,
  Move,
  Trash2,
  VolumeX,
  Volume2,
} from 'lucide-react';
import { MIN_MAIN_SCALE } from '@/lib/layout';
import type { AudioMode } from '@/lib/view/types';
import { displayedChannels } from '@/lib/view/groups';
import { useAuth } from '@/state/authStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Avatar } from '@/ui/Avatar';
import { IconButton } from '@/ui/Button';
import { LoginButton } from '../auth/LoginPrompt';
import { HomeButton } from '../favorites/HomeButton';
import { Mixer } from '../mixer/Mixer';
import { ImmersiveMixButton } from '../mixer/MixSettings';
import { OutputVolume } from '../mixer/OutputVolume';
import { PresetsMenu } from '../presets/PresetsMenu';
import { pauseAll, playAll } from '../viewer/playbackActions';
import { balanceFocusedAudio } from '../viewer/volume';
import { AddChannelBox } from './AddChannelBox';
import { toggleFullscreen } from './fullscreen';
import styles from './TopBar.module.css';
import { MusicButton } from '../music/MusicDialog';
import { usePlaybackView } from '../music/useMusic';
import { useMusicStore } from '@/state/musicStore';
import { PlaybackToolsButton } from '../tools/PlaybackTools';

const AUDIO_MODES: { mode: AudioMode; label: string; help: string }[] = [
  { mode: 'solo', label: 'Solo', help: 'Solo: hear one stream; the others are muted.' },
  {
    mode: 'duck',
    label: 'Duck',
    help: 'Duck: hear one stream loudly, the others quietly in the background (level in Settings).',
  },
  { mode: 'mix', label: 'Mix', help: 'Mix: any number of streams at full volume (Shift+1–9).' },
];

export function TopBar() {
  const view = useViewStore((s) => s.view);
  const store = useViewStore.getState();
  const playback = usePlaybackView();
  const musicEnabled = useMusicStore((s) => s.mode !== 'off');
  const musicMuted = useMusicStore((s) => s.muted);
  const fullscreen = useUi((s) => s.fullscreen);
  const arranging = useUi((s) => s.arranging);
  const openDialog = useUi((s) => s.openDialog);
  const { user, status } = useAuth();
  const mode = view.layout.mode;
  const scale = view.layout.mainScale;
  const muted = playback.audio.active.length === 0 && (!musicEnabled || musicMuted);
  const stopped = useUi(
    (s) =>
      displayedChannels(playback).filter(
        (login) => s.playerStatus[login] === 'paused' || s.playerStatus[login] === 'blocked',
      ).length,
  );

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <img src="/favicon.svg" alt="" />
        <span className={styles.brandText}>Multi Twitch</span>
      </div>
      <HomeButton />

      <AddChannelBox />

      <div className={styles.group} role="group" aria-label="Layout">
        <button
          className={styles.seg}
          aria-pressed={mode === 'grid'}
          onClick={() => store.setLayoutMode('grid')}
          title="Grid: every stream as big as possible (L)"
        >
          <LayoutGrid size={15} /> <span className={styles.segLabel}>Grid</span>
        </button>
        <button
          className={styles.seg}
          aria-pressed={mode === 'focus'}
          onClick={() => store.setLayoutMode('focus')}
          title="Focus: one big stream, the rest around it (L)"
        >
          <Presentation size={15} /> <span className={styles.segLabel}>Focus</span>
        </button>
        <button
          className={styles.seg}
          aria-label="Multi focus"
          aria-pressed={mode === 'multi-focus'}
          disabled={displayedChannels(view).length < 2}
          onClick={() => {
            if (mode === 'multi-focus') return;
            store.setLayoutMode('multi-focus');
            store.setAudioMode('mix');
            balanceFocusedAudio();
          }}
          title="Multi focus: choose two or three large streams; balance their audio in the Mixer"
        >
          <Columns3 size={15} /> <span className={styles.segLabel}>Multi focus</span>
        </button>
        {mode === 'focus' && (
          <label className={styles.scale} title="Zoom: main stream size ([ and ] keys)">
            <input
              type="range"
              min={MIN_MAIN_SCALE * 100}
              max={100}
              value={scale === 'auto' ? 75 : Math.round(scale * 100)}
              onChange={(e) => store.setMainScale(Number(e.target.value) / 100)}
              aria-label="Main stream size"
            />
            <button
              className={styles.seg}
              aria-pressed={scale === 'auto'}
              title="Auto: the small streams line up with the main one, beside or below it (\ key)"
              onClick={() => store.setMainScale('auto')}
            >
              Auto
            </button>
          </label>
        )}
      </div>

      <div className={styles.group} role="group" aria-label="Audio">
        {AUDIO_MODES.map((m) => (
          <button
            key={m.mode}
            className={styles.seg}
            aria-pressed={view.audio.mode === m.mode}
            onClick={() => store.setAudioMode(m.mode)}
            title={m.help}
          >
            {m.label}
          </button>
        ))}
        <IconButton
          size="sm"
          label={muted ? 'Unmute (M)' : 'Mute all (M)'}
          icon={muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          active={!muted}
          onClick={() => store.toggleMuteAll()}
          disabled={!playback.channels.length && !musicEnabled}
        />
        <OutputVolume />
        <ImmersiveMixButton />
        <Mixer />
        <MusicButton />
        <PlaybackToolsButton />
      </div>

      <div className={styles.actions}>
        <IconButton
          size="sm"
          label={arranging ? 'Finish arranging streams' : 'Arrange streams: drag tiles to swap'}
          icon={<Move size={16} />}
          active={arranging}
          onClick={() => useUi.getState().setArranging(!arranging)}
          disabled={!playback.channels.length}
          data-testid="arrange-toggle"
        />
        <IconButton
          size="sm"
          label={stopped ? `Play all (${stopped} paused)` : 'Play all'}
          icon={<Play size={16} />}
          active={stopped > 0}
          onClick={playAll}
          disabled={!playback.channels.length && !musicEnabled}
          data-testid="play-all"
        />
        <IconButton
          size="sm"
          label="Pause all"
          icon={<Pause size={16} />}
          onClick={pauseAll}
          disabled={!playback.channels.length && !musicEnabled}
          data-testid="pause-all"
        />
        <IconButton
          size="sm"
          label="Clear all streams"
          icon={<Trash2 size={16} />}
          onClick={() => {
            const n = playback.channels.length;
            store.clear();
            toast(`Cleared ${n} stream${n === 1 ? '' : 's'}`, {
              action: !musicEnabled
                ? { label: 'Undo', run: () => useViewStore.getState().undo() }
                : undefined,
            });
          }}
          disabled={!playback.channels.length && !musicEnabled}
          data-testid="clear-all"
        />
      </div>

      <div className={styles.spacer} />

      <PresetsMenu />
      <IconButton
        label="Chat (C)"
        icon={<MessageSquare size={18} />}
        active={view.chat.open}
        onClick={() => store.setChat({ open: !view.chat.open })}
        data-testid="chat-toggle"
      />
      <IconButton
        label={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
        icon={fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        onClick={() => void toggleFullscreen()}
      />
      <IconButton
        label="Keyboard shortcuts (?)"
        icon={<Keyboard size={18} />}
        onClick={() => openDialog('shortcuts')}
      />
      <IconButton
        label="Settings"
        icon={<Settings size={18} />}
        onClick={() => openDialog('settings')}
        data-testid="settings-button"
      />

      {status === 'authenticated' && user ? (
        <button
          className={styles.seg}
          onClick={() => openDialog('settings')}
          title={`Account: ${user.displayName}`}
          aria-label={`Account: ${user.displayName}`}
        >
          <Avatar src={user.profileImageUrl} name={user.displayName} size={24} />
        </button>
      ) : (
        <div className={styles.user}>
          {status === 'expired' && <span className={styles.expired}>Login expired</span>}
          <LoginButton label={status === 'expired' ? 'Log in again' : 'Log in'} />
        </div>
      )}
    </header>
  );
}
