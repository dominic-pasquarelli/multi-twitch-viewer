import { Crown, Music2, Volume2, VolumeX } from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import { mixPriorities, outputPercent } from '@/lib/audio/mixPreferences';
import { silenceReason } from '@/lib/audio/silence';
import { fixedMixRole } from '@/lib/audio/volumeModel';
import { audioLevel } from '@/lib/view/operations';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useMixStore } from '@/state/mixStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { usePlaybackView } from '../music/useMusic';
import {
  currentVolume,
  setStreamMix,
  toggleMixPriority,
  useVolumeModel,
  VOLUME_STEP,
} from '../viewer/volume';
import styles from './StreamMixOverlay.module.css';

export function StreamMixOverlay({
  login,
  hidden,
  kick,
}: {
  login: string;
  hidden: boolean;
  kick: boolean;
}) {
  const prefs = useMixStore();
  const base = useViewStore((s) => s.view);
  const view = usePlaybackView();
  const m = useVolumeModel();
  const main = useUi((s) => s.mainStream);
  const visibleChannels = useUi((s) => s.visibleChannels);
  const status = useUi((s) => s.playerStatus[login]);
  const output = useChannelPrefs((s) => s.output);
  const duck = useSettings((s) => s.duckLevel);
  const services = useServices();
  if (!prefs.immersive || base.audio.mode !== 'mix' || hidden) return null;
  const level = audioLevel(view, login, duck);
  const volume = currentVolume(login, m);
  const role = fixedMixRole(m, login);
  const priorities = mixPriorities(base, prefs, m.musicChannel ?? null, main, visibleChannels);
  const selected = prefs.enabled && priorities.includes(login);
  const supported =
    (kick ? services.kickPlayerFactory : services.playerFactory).capabilities?.volume !== false;
  const silence = silenceReason(level.muted, volume, level.scale * output, supported);
  const paused = status === 'paused' || status === 'blocked' || status === 'offline';
  const effective = outputPercent(volume, level.scale, output, level.muted || paused);
  const legacyMain = !role && m.priorityMain === login;
  const name =
    role === 'music'
      ? 'DJ'
      : role === 'priority'
        ? 'Priority · linked'
        : role === 'background'
          ? 'Background · linked'
          : legacyMain
            ? 'Main level'
            : 'Individual';
  const hint =
    role === 'priority' || role === 'background'
      ? `Changes the shared ${role} level for every stream using it`
      : role === 'music'
        ? 'DJ level stays the same when the selected DJ changes'
        : legacyMain
          ? 'Sets the level for whichever stream is main'
          : 'Changes only this stream’s mix level';
  return (
    <div
      className={styles.overlay}
      role="group"
      aria-label={`${login} mix controls`}
      data-testid="stream-mix-overlay"
      data-channel={login}
      data-role={role ?? 'individual'}
      data-muted={!!silence}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onWheel={(e) => {
        if (supported && e.deltaY && e.target instanceof HTMLInputElement) {
          e.stopPropagation();
          setStreamMix(login, volume + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP));
        }
      }}
    >
      <div className={styles.label}>
        <span title={login}>{login}</span>
        <span className={styles.role}>
          {role === 'music' && <Music2 size={11} />} {name}
        </span>
      </div>
      <div className={styles.controls}>
        {role !== 'music' && (
          <IconButton
            size="sm"
            label={
              selected ? `Remove ${login} from audio priority` : `Make ${login} an audio priority`
            }
            icon={<Crown size={14} />}
            active={prefs.enabled && selected}
            disabled={prefs.enabled && !selected && priorities.length >= 3}
            onClick={() => toggleMixPriority(login)}
          />
        )}
        <IconButton
          size="sm"
          label={level.muted ? `Unmute ${login}` : `Mute ${login}`}
          active={!level.muted}
          icon={level.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          onClick={() => useViewStore.getState().toggleAudio(login)}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          disabled={!supported}
          aria-label={`${login} mix volume`}
          title={supported ? hint : 'This player does not support volume adjustment'}
          onChange={(e) => setStreamMix(login, Number(e.target.value) / 100)}
        />
        <output className={styles.percent}>{Math.round(volume * 100)}%</output>
        <span
          className={styles.output}
          title="After mute, playback state and App volume; a setting, not a loudness measurement"
        >
          {!supported
            ? 'Player volume'
            : paused
              ? status === 'offline'
                ? 'Offline'
                : status === 'blocked'
                  ? 'Blocked'
                  : 'Paused'
              : level.muted
                ? 'Muted'
                : `Out ${effective}%`}
        </span>
      </div>
    </div>
  );
}
