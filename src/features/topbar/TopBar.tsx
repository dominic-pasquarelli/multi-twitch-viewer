import {
  LayoutGrid,
  Maximize,
  Minimize,
  MessageSquare,
  Presentation,
  Settings,
  Keyboard,
  VolumeX,
  Volume2,
} from 'lucide-react';
import { MIN_MAIN_SCALE } from '@/lib/layout';
import { useAuth } from '@/state/authStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Avatar } from '@/ui/Avatar';
import { IconButton } from '@/ui/Button';
import { LoginButton } from '../auth/LoginPrompt';
import { PresetsMenu } from '../presets/PresetsMenu';
import { AddChannelBox } from './AddChannelBox';
import { toggleFullscreen } from './fullscreen';
import styles from './TopBar.module.css';

export function TopBar() {
  const view = useViewStore((s) => s.view);
  const store = useViewStore.getState();
  const fullscreen = useUi((s) => s.fullscreen);
  const openDialog = useUi((s) => s.openDialog);
  const { user, status } = useAuth();
  const mode = view.layout.mode;
  const scale = view.layout.mainScale;
  const muted = view.audio.active.length === 0;

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <img src="/favicon.svg" alt="" />
        <span className={styles.brandText}>Multi Twitch</span>
      </div>

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
        {mode === 'focus' && (
          <label className={styles.scale} title="Main stream size ([ and ] keys; \ for auto)">
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
              onClick={() => store.setMainScale('auto')}
            >
              Auto
            </button>
          </label>
        )}
      </div>

      <div className={styles.group} role="group" aria-label="Audio">
        <button
          className={styles.seg}
          aria-pressed={view.audio.mode === 'solo'}
          onClick={() => store.setAudioMode(view.audio.mode === 'solo' ? 'mix' : 'solo')}
          title={
            view.audio.mode === 'solo'
              ? 'Solo: hearing one stream mutes the others. Click to allow mixing.'
              : 'Mix: several streams can play sound. Click for one-at-a-time.'
          }
        >
          {view.audio.mode === 'solo' ? 'Solo audio' : 'Mix audio'}
        </button>
        <IconButton
          size="sm"
          label={muted ? 'Unmute (M)' : 'Mute all (M)'}
          icon={muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          active={!muted}
          onClick={() => store.toggleMuteAll()}
          disabled={!view.channels.length}
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
          title="Account settings"
        >
          <Avatar src={user.profileImageUrl} name={user.displayName} size={24} />
          <span className={styles.segLabel}>{user.displayName}</span>
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
