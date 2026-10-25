import { useChannelPrefs } from '@/state/channelPrefsStore';
import { activeMusicChannel } from '@/lib/music/music';
import { useMusicStore } from '@/state/musicStore';
import { VOLUME_STEP } from '../viewer/volume';
import styles from './OutputVolume.module.css';

/**
 * The app's overall volume (top bar, next to Mute all): scales everything it
 * plays without changing any stream's own level or the mix between them.
 */
export function OutputVolume() {
  const output = useChannelPrefs((s) => s.output);
  const setOutput = useChannelPrefs((s) => s.setOutput);
  const pct = Math.round(output * 100);
  return (
    <label
      className={styles.output}
      title={`App volume: ${pct}% of every stream (scroll to adjust)`}
    >
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => setOutput(Number(e.target.value) / 100)}
        onWheel={(e) => {
          if (e.deltaY) setOutput(output + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP));
        }}
        aria-label="App volume"
        data-testid="output-volume"
      />
      <span className={styles.percent}>{pct}%</span>
    </label>
  );
}

/** The independent DJ level stays within reach while a DJ is selected. */
export function DJVolume() {
  const channel = useMusicStore(activeMusicChannel);
  const volume = useMusicStore((s) => s.volume);
  const setVolume = useMusicStore((s) => s.setVolume);
  if (!channel) return null;
  const pct = Math.round(volume * 100);
  return (
    <label
      className={`${styles.output} ${styles.dj}`}
      data-channel={channel}
      title={`DJ volume: ${pct}% · ${channel}. App volume and per-DJ trim still apply (scroll to adjust).`}
    >
      <span className={styles.djLabel} aria-hidden="true">
        DJ
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        onWheel={(e) => {
          if (e.deltaY) setVolume(volume + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP));
        }}
        aria-label="DJ volume"
        aria-valuetext={`${pct}%`}
        data-testid="dj-volume"
      />
      <span className={styles.percent}>{pct}%</span>
    </label>
  );
}
