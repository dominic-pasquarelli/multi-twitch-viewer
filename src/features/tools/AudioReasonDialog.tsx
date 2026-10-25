import { audioLevel } from '@/lib/view/operations';
import { activeMusicChannel } from '@/lib/music/music';
import { muteExplanation } from '@/lib/audio/muteExplanation';
import { silenceReason } from '@/lib/audio/silence';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useMusicStore } from '@/state/musicStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { usePlaybackView } from '../music/useMusic';
import { currentVolume, setStreamMix, useVolumeModel } from '../viewer/volume';
import { temporaryScale, usePlaybackEffects } from '@/state/playbackEffectsStore';
import formStyles from '@/ui/Form.module.css';

export function AudioReasonDialog() {
  const open = useUi((s) => s.dialog === 'streamAudio');
  return (
    <Dialog open={open} title="Stream audio" onClose={() => useUi.getState().openDialog(null)}>
      {open && <AudioControls />}
    </Dialog>
  );
}

function AudioControls() {
  const login = useUi((s) => s.selected) ?? '';
  const base = useViewStore();
  const music = useMusicStore();
  const view = usePlaybackView();
  const output = useChannelPrefs((s) => s.output);
  const duck = useSettings((s) => s.duckLevel);
  const effects = usePlaybackEffects();
  const level = audioLevel(view, login, duck);
  const volume = currentVolume(login, useVolumeModel());
  const reason = silenceReason(
    level.muted,
    volume,
    level.scale * output * temporaryScale(login, activeMusicChannel(music), effects),
  );
  const explanation =
    reason === 'Audio muted'
      ? muteExplanation(login, base.view, music, base.mutedFrom !== null)
      : reason;
  return (
    <div>
      <p>
        <strong>{login}</strong> · <span role="status">{explanation ?? 'Audio is enabled'}</span>
      </p>
      <p className={formStyles.help}>
        Player volume settings do not measure actual loudness. Playback may also be paused or
        buffering.
      </p>
      <label className={formStyles.field}>
        Stream level: {Math.round(volume * 100)}%
        <input
          aria-label={`${login} audio level`}
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setStreamMix(login, Number(e.target.value) / 100)}
        />
      </label>
      <label className={formStyles.field}>
        App volume: {Math.round(output * 100)}%
        <input
          aria-label="App output level"
          type="range"
          min={0}
          max={100}
          value={Math.round(output * 100)}
          onChange={(e) => useChannelPrefs.getState().setOutput(Number(e.target.value) / 100)}
        />
      </label>
      <div className={formStyles.row} style={{ flexWrap: 'wrap' }}>
        {base.mutedFrom !== null && <Button onClick={base.toggleMuteAll}>Unmute app</Button>}
        <Button
          onClick={() => {
            if (level.muted) base.toggleAudio(login);
          }}
        >
          Listen to {login}
        </Button>
        {music.mode !== 'off' && (
          <Button onClick={() => useUi.getState().openDialog('music')}>Music settings</Button>
        )}
        <Button onClick={() => useUi.getState().openDialog(null)}>Done</Button>
      </div>
    </div>
  );
}
