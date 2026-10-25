import { useState } from 'react';
import { ArrowDown, ArrowUp, Music2, Pin, Plus, X, Volume2, VolumeX } from 'lucide-react';
import { parseChannelInput } from '@/lib/channels/parseChannels';
import { activeMusicChannel } from '@/lib/music/music';
import { useMusicStore } from '@/state/musicStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useUi } from '@/state/uiStore';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Form';
import { Dialog } from '@/ui/Dialog';
import { useUsersFor } from '../follows/queries';
import { useMusicStatus } from './useMusic';
import { MusicChannelPicker } from './MusicChannelPicker';
import formStyles from '@/ui/Form.module.css';
import styles from './MusicDialog.module.css';

export function MusicButton() {
  const music = useMusicStore();
  const channel = activeMusicChannel(music);
  return (
    <IconButton
      size="sm"
      icon={<Music2 size={16} />}
      active={music.mode !== 'off'}
      label={
        channel
          ? `Music: ${channel}${music.muted ? ' (muted)' : ''}`
          : 'Music: choose DJs and priority'
      }
      onClick={() => useUi.getState().openDialog('music')}
      data-testid="music-button"
    />
  );
}

export function MusicDialog() {
  const open = useUi((s) => s.dialog === 'music');
  return (
    <Dialog open={open} title="Music" width={980} onClose={() => useUi.getState().openDialog(null)}>
      {open && <MusicEditor />}
    </Dialog>
  );
}

function MusicEditor() {
  const music = useMusicStore();
  const channel = activeMusicChannel(music);
  const { live, known, error } = useMusicStatus();
  const users = new Map(
    (useUsersFor(music.channels).data ?? []).map((u) => [u.login, u.displayName]),
  );
  const favorites = useChannelPrefs((s) => s.favorites);
  const [text, setText] = useState('');
  const parsed = parseChannelInput(text);
  const name = (c: string) => users.get(c) ?? c;
  return (
    <div className={styles.editor}>
      <p>
        Keep a DJ playing while you watch other streams. Automatic uses the first live channel
        below, and switches when a higher-priority DJ goes live or the current one goes offline.
      </p>
      <div className={styles.modes} role="group" aria-label="Music selection">
        <Button aria-pressed={music.mode === 'off'} onClick={() => music.setMode('off')}>
          Off
        </Button>
        <Button
          aria-pressed={music.mode === 'auto'}
          disabled={!music.channels.length}
          onClick={() => music.setMode('auto')}
        >
          Automatic
        </Button>
        {music.mode === 'pinned' && (
          <span>
            <Pin size={14} /> Pinned: {channel && name(channel)}
          </span>
        )}
      </div>
      <div className={styles.now} data-testid="music-status" role="status">
        {music.mode === 'off'
          ? 'Music is off.'
          : music.paused
            ? 'Music paused with Pause all.'
            : channel
              ? `${music.mode === 'pinned' ? 'Pinned' : 'Selected'}: ${name(channel)}${music.muted ? ' · Muted' : ''}`
              : error
                ? 'Could not check live status. Keeping the last selection.'
                : known
                  ? 'No preferred DJs are live. Waiting for one to go live.'
                  : 'Checking which DJs are live…'}
        {music.mode === 'auto' && channel && error && (
          <small>Live status unavailable; keeping this DJ.</small>
        )}
      </div>
      <div className={styles.volume}>
        <IconButton
          size="sm"
          icon={music.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          label={music.muted ? 'Unmute music' : 'Mute music'}
          onClick={() => music.setMuted(!music.muted)}
        />
        <span>Music volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(music.volume * 100)}
          aria-label="Music volume"
          onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
        />
        <output>{Math.round(music.volume * 100)}%</output>
      </div>
      <Checkbox
        checked={music.mixWithStreams}
        onChange={music.setMixWithStreams}
        label="Mix with stream audio"
        help="Off: hear only music while watching. On: keep music alongside your Solo, Duck or Mix audio. Music has its own volume; M mutes everything."
      />
      <div className={styles.columns}>
        <MusicChannelPicker />
        <section className={styles.order} aria-label="Your music order">
          <h3>
            Your music order <small>{music.channels.length}/50</small>
          </h3>
          <form
            className={styles.add}
            onSubmit={(e) => {
              e.preventDefault();
              music.addChannels(parsed);
              setText('');
            }}
          >
            <input
              className={formStyles.input}
              aria-label="Add music channels"
              placeholder="DJ names or twitch.tv links"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" disabled={!parsed.length || music.channels.length >= 50}>
              <Plus size={14} /> Add
            </Button>
          </form>
          <Button
            size="small"
            disabled={
              !favorites.some((c) => !music.channels.includes(c)) || music.channels.length >= 50
            }
            onClick={() => music.addChannels(favorites)}
          >
            Add from favorites
          </Button>
          <ol className={styles.list} aria-label="Music priority" data-testid="music-list">
            {music.channels.map((c, i) => (
              <li key={c} data-testid="music-row" data-channel={c} data-current={channel === c}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.name}>
                  {name(c)}
                  <small>{live.has(c) ? 'Live' : known ? 'Offline' : 'Checking…'}</small>
                </span>
                <IconButton
                  size="sm"
                  icon={<ArrowUp size={15} />}
                  label={`Move ${name(c)} up`}
                  disabled={i === 0}
                  onClick={() => music.moveChannel(c, -1)}
                />
                <IconButton
                  size="sm"
                  icon={<ArrowDown size={15} />}
                  label={`Move ${name(c)} down`}
                  disabled={i === music.channels.length - 1}
                  onClick={() => music.moveChannel(c, 1)}
                />
                <IconButton
                  size="sm"
                  icon={<Pin size={15} />}
                  label={`Pin ${name(c)} as music`}
                  active={music.mode === 'pinned' && channel === c}
                  onClick={() => music.pin(c)}
                />
                <IconButton
                  size="sm"
                  icon={<X size={15} />}
                  label={`Remove ${name(c)} from music`}
                  onClick={() => music.removeChannel(c)}
                />
              </li>
            ))}
          </ol>
          {!music.channels.length && (
            <p>Add your preferred DJs in priority order, or use “Pin as music” on a stream.</p>
          )}
        </section>
      </div>
      <small>
        Live status follows the refresh interval in Settings. Pinning a DJ overrides the automatic
        order until you choose Automatic again.
      </small>
      <Button onClick={() => useUi.getState().openDialog(null)}>Done</Button>
    </div>
  );
}
