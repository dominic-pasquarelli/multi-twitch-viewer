import { useState } from 'react';
import { ArrowDown, ArrowUp, Music2, Pin, Plus, X, Volume2, VolumeX } from 'lucide-react';
import { parseChannelInput } from '@/lib/channels/parseChannels';
import { activeMusicChannel } from '@/lib/music/music';
import { musicCategory } from '@/lib/music/discovery';
import { useMusicStore } from '@/state/musicStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Form';
import { Dialog } from '@/ui/Dialog';
import { useUsersFor } from '../follows/queries';
import { useMusicStatus } from './useMusic';
import { MusicChannelPicker } from './MusicChannelPicker';
import { DJListeningMode } from './DJListeningMode';
import formStyles from '@/ui/Form.module.css';
import styles from './MusicDialog.module.css';

export function MusicButton() {
  const music = useMusicStore();
  const channel = activeMusicChannel(music);
  const appMuted = useViewStore((s) => s.mutedFrom !== null);
  const output = useChannelPrefs((s) => s.output);
  const label =
    music.mode === 'off'
      ? 'DJ off'
      : music.paused
        ? 'DJ paused'
        : music.muted || music.volume === 0 || appMuted || output === 0
          ? 'DJ muted'
          : channel
            ? `DJ: ${channel}`
            : 'DJ: waiting';
  return (
    <Button
      size="small"
      className={styles.musicButton}
      aria-label={`DJ & music · ${label}`}
      aria-haspopup="dialog"
      data-active={music.mode !== 'off'}
      title={`${label} · Choose your DJ and how it mixes with stream audio`}
      onClick={() => useUi.getState().openDialog('music')}
      data-testid="music-button"
    >
      <Music2 size={16} aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}

export function MusicDialog() {
  const open = useUi((s) => s.dialog === 'music');
  return (
    <Dialog
      open={open}
      title="DJ & music"
      width={980}
      onClose={() => useUi.getState().openDialog(null)}
    >
      {open && <MusicEditor />}
    </Dialog>
  );
}

function MusicEditor() {
  const music = useMusicStore();
  const channel = activeMusicChannel(music);
  const { live, streams, known, error } = useMusicStatus();
  const appMuted = useViewStore((s) => s.mutedFrom !== null);
  const appOutput = useChannelPrefs((s) => s.output);
  const users = new Map(
    (useUsersFor(music.channels).data ?? []).map((u) => [u.login, u.displayName]),
  );
  const favorites = useChannelPrefs((s) => s.favorites);
  const [text, setText] = useState('');
  const parsed = parseChannelInput(text);
  const name = (c: string) => users.get(c) ?? c;
  const choices = [...new Set([...music.channels, ...(music.pinned ? [music.pinned] : [])])];
  const status =
    music.mode === 'off'
      ? 'Music is off.'
      : music.paused
        ? 'Music paused with Pause all.'
        : channel
          ? `${music.mode === 'pinned' ? 'Pinned' : 'Selected'}: ${name(channel)}${music.muted ? ' · Muted' : ''}`
          : error
            ? 'Could not check live status. Keeping the last selection.'
            : known
              ? music.skipped.length || music.musicOnly
                ? 'No preferred DJs are eligible. Check category rules and session skips below.'
                : 'No preferred DJs are live. Waiting for one to go live.'
              : 'Checking which DJs are live…';
  return (
    <div className={styles.editor}>
      <p>
        Choose one DJ for background music, then decide whether to hear your other streams too. Your
        DJ has a separate volume from priority and background streams.
      </p>
      <div className={styles.now}>
        <div className={styles.nowHeading}>
          <Music2 size={20} aria-hidden="true" />
          <strong data-testid="music-status" role="status">
            {status}
          </strong>
        </div>
        {music.mode !== 'off' && (
          <small>
            {music.mode === 'auto' ? 'Automatic selection' : 'One fixed DJ · no automatic fallback'}
            {' · '}
            {music.mixWithStreams ? 'DJ + stream audio' : 'DJ only'}
            {' · '}DJ level {Math.round(music.volume * 100)}%
          </small>
        )}
        {music.mode === 'auto' && channel && error && (
          <small>Live status unavailable; keeping this DJ.</small>
        )}
        {music.mode === 'pinned' && channel && known && !live.has(channel) && (
          <small>
            This DJ is offline. Waiting for them; choose Automatic to use another live DJ.
          </small>
        )}
        {music.mode !== 'off' && (appMuted || appOutput === 0) && (
          <div className={styles.notice} role="status">
            {appMuted && (
              <>
                <span>All app audio is muted.</span>
                <Button size="small" onClick={() => useViewStore.getState().toggleMuteAll()}>
                  Unmute app
                </Button>
              </>
            )}
            {appOutput === 0 && (
              <span>App volume is 0%. Raise App volume in the top bar to hear audio.</span>
            )}
          </div>
        )}
      </div>
      <h3 className={styles.sectionTitle}>How to choose your DJ</h3>
      <div className={styles.modes} role="group" aria-label="Music selection">
        <div className={styles.mode} data-active={music.mode === 'off'}>
          <Button aria-pressed={music.mode === 'off'} onClick={() => music.setMode('off')}>
            Off
          </Button>
          <small>Use your normal stream audio.</small>
        </div>
        <div className={styles.mode} data-active={music.mode === 'auto'}>
          <Button
            aria-pressed={music.mode === 'auto'}
            disabled={!music.channels.length}
            onClick={() => music.setMode('auto')}
          >
            Automatic
          </Button>
          <small>Play the first eligible live DJ in your order below.</small>
        </div>
        <div className={styles.mode} data-active={music.mode === 'pinned'}>
          <Button
            aria-pressed={music.mode === 'pinned'}
            disabled={!choices.length}
            onClick={() => {
              const next =
                channel ?? music.pinned ?? choices.find((c) => live.has(c)) ?? choices[0];
              if (next) music.pin(next);
            }}
          >
            Pick a DJ
          </Button>
          <small>Keep one DJ until you choose another or turn it off.</small>
          <select
            className={formStyles.input}
            aria-label="Pick a DJ"
            value={music.mode === 'pinned' ? (music.pinned ?? '') : ''}
            disabled={!choices.length}
            onChange={(e) => {
              if (e.target.value) music.pin(e.target.value);
            }}
          >
            <option value="" disabled>
              Choose a saved DJ…
            </option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {name(c)}
                {live.has(c) ? ' · Live' : known ? ' · Offline' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!choices.length && <p>Add DJs from your followed channels below to get started.</p>}
      <h3 className={styles.sectionTitle}>What do you want to hear?</h3>
      <DJListeningMode />
      <div className={styles.volume}>
        <IconButton
          size="sm"
          icon={music.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          label={music.muted ? 'Unmute music' : 'Mute music'}
          onClick={() => music.setMuted(!music.muted)}
        />
        <span>DJ volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(music.volume * 100)}
          aria-label="DJ volume"
          onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
        />
        <output>{Math.round(music.volume * 100)}%</output>
      </div>
      <details className={styles.rules}>
        <summary>DJ rules and transitions</summary>
        <Checkbox
          checked={music.musicOnly}
          onChange={(musicOnly) => music.update({ musicOnly })}
          label="Only automatically select Music or DJs categories"
          help="Live channels in other categories are ignored. Pinned DJs override this rule."
        />
        <Checkbox
          checked={music.keepCurrent}
          onChange={(keepCurrent) => music.update({ keepCurrent })}
          label="Keep the current DJ until they go offline"
          help="A higher-priority channel going live will not interrupt your music."
        />
        <label className={styles.transitionLabel}>
          Transition fade{' '}
          <select
            className={formStyles.input}
            aria-label="DJ transition fade"
            value={music.fadeSeconds}
            onChange={(e) => music.update({ fadeSeconds: Number(e.target.value) })}
          >
            {[0, 0.5, 1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} seconds` : 'Off'}
              </option>
            ))}
          </select>
        </label>
        <small>Fades soften transitions; the next live player may still need time to load.</small>
        {music.skipped.length > 0 && (
          <Button size="small" onClick={music.resetSkips}>
            Reset session skips ({music.skipped.length})
          </Button>
        )}
      </details>
      <div className={styles.columns}>
        <MusicChannelPicker />
        <section className={styles.order} aria-label="Your music order">
          <h3>
            Your DJ order <small>{music.channels.length}/50</small>
          </h3>
          <p className={styles.hint}>
            Automatic checks from top to bottom. Adding a DJ saves them; use Automatic or Play now
            to start.
          </p>
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
              placeholder="Twitch DJs, kick:name, or channel links"
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
                  {music.skipped.includes(c) && <small>Skipped in Automatic</small>}
                  {music.musicOnly &&
                    live.has(c) &&
                    !streams.some((s) => s.login === c && musicCategory(s.gameName)) && (
                      <small>Outside Music/DJs · Automatic ignores this DJ</small>
                    )}
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
                <Button
                  size="small"
                  aria-label={`Pin ${name(c)} as music`}
                  aria-pressed={music.mode === 'pinned' && channel === c}
                  title="Use this DJ until you choose another or turn DJ mode off"
                  onClick={() => music.pin(c)}
                >
                  {music.mode === 'pinned' && channel === c ? (
                    <>
                      <Pin size={13} /> Pinned
                    </>
                  ) : (
                    'Play now'
                  )}
                </Button>
                <IconButton
                  size="sm"
                  icon={<X size={15} />}
                  label={`Remove ${name(c)} from music`}
                  onClick={() => music.removeChannel(c)}
                />
                <details className={styles.djOptions}>
                  <summary>
                    DJ options
                    {music.trims[c] && music.trims[c] !== 1
                      ? ` · ${Math.round(music.trims[c]! * 100)}% trim`
                      : ''}
                  </summary>
                  <div>
                    <label>
                      Volume trim{' '}
                      <input
                        type="range"
                        min={25}
                        max={200}
                        step={5}
                        value={Math.round((music.trims[c] ?? 1) * 100)}
                        aria-label={`${name(c)} DJ trim`}
                        onChange={(e) => music.setTrim(c, Number(e.target.value) / 100)}
                      />
                      <output>{Math.round((music.trims[c] ?? 1) * 100)}%</output>
                    </label>
                    <Button
                      size="small"
                      disabled={
                        music.mode === 'pinned' && channel === c && !music.skipped.includes(c)
                      }
                      onClick={() => (music.skipped.includes(c) ? music.unskip(c) : music.skip(c))}
                    >
                      {music.skipped.includes(c) ? 'Include in Automatic' : 'Skip this session'}
                    </Button>
                  </div>
                  <small>
                    Trim adjusts this DJ relative to DJ volume (100% = unchanged). Session skips
                    affect Automatic only; a pinned DJ stays selected.
                  </small>
                </details>
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
        order until you choose Automatic again. M mutes all audio; App volume scales the whole mix.
      </small>
      <Button onClick={() => useUi.getState().openDialog(null)}>Done</Button>
    </div>
  );
}
