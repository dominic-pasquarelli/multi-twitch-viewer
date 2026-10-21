import { useChannelPrefs } from '@/state/channelPrefsStore';
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
