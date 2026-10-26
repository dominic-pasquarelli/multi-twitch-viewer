import { Music2 } from 'lucide-react';
import { channelName, kickSlugFromId } from '@/lib/channels/parseChannels';
import { activeMusicChannel } from '@/lib/music/music';
import { useMusicStore } from '@/state/musicStore';
import { Button } from '@/ui/Button';
import { useMusicStatus } from './useMusic';
import { selectOrFocusDJ } from './djSelection';
import styles from './LiveDJs.module.css';

export function LiveDJs() {
  const music = useMusicStore();
  const { live, streams, error, known } = useMusicStatus();
  if (music.mode === 'off' || music.channels.length < 2) return null;
  const selected = activeMusicChannel(music);
  const choices = music.channels.filter((channel) => live.has(channel));
  return (
    <div className={styles.bar} data-testid="live-djs">
      <span className={styles.label}>
        <Music2 size={14} aria-hidden="true" /> Live DJs
      </span>
      <div className={styles.choices} role="group" aria-label="Live DJs">
        {choices.map((channel) => {
          const name =
            streams.find((s) => s.login === channel)?.displayName ?? channelName(channel);
          const current = selected === channel;
          return (
            <Button
              key={channel}
              size="small"
              className={styles.choice}
              data-channel={channel}
              aria-label={current ? `Focus DJ ${name}` : `Switch DJ to ${name}`}
              aria-pressed={current}
              title={
                current
                  ? 'Selected DJ · Click again to make this the main stream'
                  : 'Play this DJ without changing your main stream or saved DJ order'
              }
              onClick={() => selectOrFocusDJ(channel)}
            >
              {current && <span className={styles.selected}>Selected · </span>}
              {name}
              {kickSlugFromId(channel) && <small>Kick</small>}
            </Button>
          );
        })}
        {!choices.length && (
          <span className={styles.hint}>
            {error ? 'Live status unavailable' : known ? 'No saved DJs live' : 'Checking DJs…'}
          </span>
        )}
      </div>
      {music.mode === 'pinned' && (
        <Button
          size="small"
          className={styles.automatic}
          title="Return to your saved DJ priority order"
          onClick={() => music.setMode('auto', { preservePaused: true })}
        >
          Resume Automatic
        </Button>
      )}
      <small className={styles.hint}>Click to switch · click selected DJ to focus</small>
    </div>
  );
}
