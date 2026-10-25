import { useEffect, useState } from 'react';
import { Activity, Timer } from 'lucide-react';
import { desktop } from '@/lib/desktop/bridge';
import { useSleepTimer } from '@/state/sleepTimerStore';
import { useUi } from '@/state/uiStore';
import { toast } from '@/state/toastStore';
import { Button, IconButton } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Tabs, TabPanel } from '@/ui/Tabs';
import { Field } from '@/ui/Form';
import { playerRegistry } from '../viewer/playerRegistry';
import { playbackRecovery } from '../viewer/playbackRecovery';
import { usePlaybackView } from '../music/useMusic';
import { captureBackup, parseBackup, restoreBackup, type AppBackup } from './backup';
import { downloadText, pickTextFile } from '../presets/fileIO';
import formStyles from '@/ui/Form.module.css';
import styles from './PlaybackTools.module.css';
import { repairVisiblePlayback } from '../viewer/repairPlayback';

function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function PlaybackToolsButton() {
  const endsAt = useSleepTimer((s) => s.endsAt);
  return (
    <IconButton
      size="sm"
      icon={endsAt ? <Timer size={16} /> : <Activity size={16} />}
      label={
        endsAt
          ? 'Playback tools · sleep timer running'
          : 'Playback tools: health, sleep timer and backup'
      }
      active={!!endsAt}
      data-testid="playback-tools-button"
      onClick={() => useUi.getState().openDialog('tools')}
    />
  );
}

type ToolsTab = 'health' | 'sleep' | 'backup';
export function PlaybackToolsDialog() {
  const open = useUi((s) => s.dialog === 'tools');
  return (
    <Dialog
      open={open}
      title="Playback tools"
      width={820}
      onClose={() => useUi.getState().openDialog(null)}
    >
      {open && <Tools />}
    </Dialog>
  );
}
function Tools() {
  const [tab, setTab] = useState<ToolsTab>('health');
  return (
    <>
      <Tabs<ToolsTab>
        active={tab}
        onChange={setTab}
        label="Playback tools sections"
        tabs={[
          { id: 'health', label: 'Playback health' },
          { id: 'sleep', label: 'Sleep timer' },
          { id: 'backup', label: 'Backup & restore' },
        ]}
      />
      <TabPanel id={tab}>
        {tab === 'health' ? <PlaybackHealth /> : tab === 'sleep' ? <SleepTimer /> : <Backup />}
      </TabPanel>
    </>
  );
}

const metric = (value: unknown, suffix = '', digits = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—';
function PlaybackHealth() {
  useClock();
  const view = usePlaybackView();
  const status = useUi((s) => s.playerStatus);
  const visible = useUi((s) => s.visibleChannels);
  const recoveryNotice = useUi((s) => s.recoveryNotice);
  return (
    <>
      <div className={styles.actions}>
        <Button
          disabled={!view.channels.length}
          onClick={() =>
            toast(
              `Rebuilding ${repairVisiblePlayback()} visible players. Your mix and explicit pauses are preserved.`,
            )
          }
        >
          Rebuild visible players
        </Button>
      </div>
      {recoveryNotice && (
        <p role="status" className={formStyles.help}>
          {recoveryNotice}
        </p>
      )}
      <p className={formStyles.help}>
        Updates every second. Missing telemetry appears as —. Browser Kick players do not expose
        these statistics. Live latency is an estimate from the player.
      </p>
      {!view.channels.length && <p>No streams are open.</p>}
      <div className={styles.tableWrap}>
        <table className={styles.health} aria-label="Playback health">
          <thead>
            <tr>
              <th>Stream</th>
              <th>State</th>
              <th>Quality</th>
              <th>Buffer</th>
              <th>FPS</th>
              <th>Dropped</th>
              <th>Bitrate</th>
              <th>Live delay</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {view.channels.map((login) => {
              const entry = playerRegistry.get(login);
              const stats = entry?.adapter.getPlaybackStats?.();
              const holds = playbackRecovery.pauseReasons(login);
              const hidden = visible !== null && !visible.includes(login);
              const starving =
                status[login] === 'playing' &&
                stats?.fps !== undefined &&
                stats.fps <= 1 &&
                stats.bufferSize !== undefined &&
                stats.bufferSize <= 0.5;
              return (
                <tr key={login} data-testid="health-row" data-channel={login}>
                  <th>{login}</th>
                  <td>
                    {hidden
                      ? 'Hidden'
                      : holds.includes('manual')
                        ? 'Paused by you'
                        : holds.includes('bandwidth')
                          ? 'Bandwidth recovery'
                          : starving
                            ? 'Buffering'
                            : status[login] === 'paused'
                              ? 'Interrupted · retrying'
                              : (status[login] ?? 'Loading')}
                  </td>
                  <td>{stats?.videoResolution || entry?.adapter.getQuality() || '—'}</td>
                  <td>{metric(stats?.bufferSize, 's', 1)}</td>
                  <td>{metric(stats?.fps)}</td>
                  <td>{metric(stats?.skippedFrames)}</td>
                  <td>{metric(stats?.playbackRate, ' kbps')}</td>
                  <td>{metric(stats?.hlsLatencyBroadcaster, 's', 1)}</td>
                  <td>
                    <div className={styles.actions}>
                      <Button
                        size="small"
                        disabled={!entry || hidden}
                        onClick={() => {
                          playbackRecovery.allowManualPlay(login);
                          entry?.adapter.play();
                          entry?.controller.reapply();
                          desktop?.playAll?.([login]);
                        }}
                      >
                        Resume {login}
                      </Button>
                      <Button
                        size="small"
                        disabled={!entry}
                        onClick={() => useUi.getState().reloadPlayer(login)}
                      >
                        Reload {login}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={formStyles.help}>
        Unexpected stops are retried automatically. Explicit pauses and hidden groups remain held.
        Reloads are limited to avoid repeatedly restarting a failing stream.
      </p>
    </>
  );
}

function SleepTimer() {
  const timer = useSleepTimer();
  const now = useClock();
  const [minutes, setMinutes] = useState(60);
  const [fade, setFade] = useState(30);
  const remaining = timer.endsAt ? Math.max(0, Math.floor((timer.endsAt - now) / 1000)) : 0;
  return (
    <div className={styles.stack}>
      <p>
        Fade everything down, then pause all streams. Your saved app and stream volumes stay intact.
      </p>
      <Field label="Stop playback after">
        <input
          type="number"
          className={formStyles.input}
          aria-label="Sleep timer minutes"
          min={1}
          max={720}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
        <small>Minutes · 1–720</small>
      </Field>
      <Field label="Fade-out duration">
        <select
          className={formStyles.input}
          aria-label="Sleep timer fade"
          value={fade}
          onChange={(e) => setFade(Number(e.target.value))}
        >
          {[0, 10, 30, 60].map((n) => (
            <option value={n} key={n}>
              {n ? `Final ${n} seconds` : 'No fade'}
            </option>
          ))}
        </select>
      </Field>
      <p role="status" data-testid="sleep-timer-status">
        {timer.endsAt
          ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining`
          : timer.finished
            ? 'Timer finished. Playback paused.'
            : 'No timer running.'}
      </p>
      <div className={styles.actions}>
        <Button
          disabled={!Number.isFinite(minutes) || minutes < 1 || minutes > 720}
          onClick={() => timer.start(minutes, fade)}
        >
          {timer.endsAt ? 'Restart sleep timer' : 'Start sleep timer'}
        </Button>
        {timer.endsAt && <Button onClick={timer.cancel}>Cancel sleep timer</Button>}
      </div>
      <small className={formStyles.help}>
        For this app session. Closing or reloading the app cancels the timer. Play all resumes
        playback after it finishes.
      </small>
    </div>
  );
}

function Backup() {
  const [pending, setPending] = useState<AppBackup | null>(null);
  const [error, setError] = useState('');
  const pick = async () => {
    const text = await pickTextFile();
    if (!text) return;
    try {
      setPending(parseBackup(text));
      setError('');
    } catch (err) {
      setPending(null);
      setError((err as Error).message);
    }
  };
  return (
    <div className={styles.stack}>
      <p>
        Back up scenes and presets, DJ preferences and trims, favorites, channel levels, linked Kick
        channels, watch history, the current layout and app settings.
      </p>
      <p className={formStyles.help}>
        Sign-ins, API credentials, session skips and active sleep timers stay on this device.
        Restoring replaces the backed-up preferences and cancels the current sleep timer.
      </p>
      <div className={styles.actions}>
        <Button
          onClick={() =>
            downloadText(
              `multi-twitch-backup-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(captureBackup(), null, 2),
            )
          }
        >
          Download full backup
        </Button>
        <Button onClick={() => void pick()}>Choose backup to restore</Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {pending && (
        <section className={styles.preview} aria-label="Backup restore preview">
          <strong>Ready to restore</strong>
          <p>
            {pending.data.presets.length} presets/scenes ·{' '}
            {pending.data.scene.music.channels.length} DJs ·{' '}
            {pending.data.channelPrefs.favorites.length} favorites ·{' '}
            {pending.data.view.channels.length} open streams
          </p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => {
                const before = captureBackup();
                restoreBackup(pending);
                setPending(null);
                toast('Restored app preferences.', {
                  action: { label: 'Undo restore', run: () => restoreBackup(before) },
                });
              }}
            >
              Restore these settings
            </Button>
            <Button onClick={() => setPending(null)}>Cancel restore</Button>
          </div>
        </section>
      )}
    </div>
  );
}
