import { useMusicStore } from '@/state/musicStore';
import { Button } from '@/ui/Button';
import styles from './DJListeningMode.module.css';

/** The DJ panel and Mixer use the same explicit listening choices. */
export function DJListeningMode() {
  const music = useMusicStore();
  return (
    <div className={styles.choices}>
      <div className={styles.buttons} role="group" aria-label="DJ listening mode">
        <Button
          size="small"
          aria-pressed={music.mixWithStreams}
          onClick={() => music.setMixWithStreams(true)}
        >
          DJ + stream audio
        </Button>
        <Button
          size="small"
          aria-pressed={!music.mixWithStreams}
          onClick={() => music.setMixWithStreams(false)}
        >
          DJ only
        </Button>
      </div>
      <p>
        {music.mode === 'off'
          ? 'This choice takes effect when you turn on a DJ.'
          : music.mixWithStreams
            ? 'The DJ plays alongside your Solo, Duck or Mix audio. Use the Mixer to balance streams.'
            : 'Other streams stay visible with their audio muted while DJ mode is on.'}
      </p>
    </div>
  );
}
