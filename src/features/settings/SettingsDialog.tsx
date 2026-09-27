import { redirectUri } from '@/config/appConfig';
import { desktop } from '@/lib/desktop/bridge';
import { useClientId, useServices } from '@/app/servicesContext';
import { useAuth } from '@/state/authStore';
import { useState } from 'react';
import type { LiveAlertMode } from '@/lib/alerts/goLive';
import type { AudioMode } from '@/lib/view/types';
import { useSettings, type QualityMode } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Checkbox, Field } from '@/ui/Form';
import formStyles from '@/ui/Form.module.css';
import { logout, startLogin } from '../auth/authFlow';
import { notificationPermission, requestNotifications } from '../alerts/notifications';
import { LoginButton } from '../auth/LoginPrompt';
import { useUpdateStatus } from '../updates/useUpdateStatus';

export function SettingsDialog() {
  const open = useUi((s) => s.dialog === 'settings');
  return (
    <Dialog open={open} title="Settings" onClose={() => useUi.getState().openDialog(null)}>
      {open && <SettingsForm />}
    </Dialog>
  );
}

function SettingsForm() {
  const s = useSettings();
  const clientId = useClientId();
  const { mock } = useServices();
  const user = useAuth((a) => a.user);
  const status = useAuth((a) => a.status);
  const audioMode = useViewStore((v) => v.view.audio.mode);

  return (
    <>
      <h3 className={formStyles.section}>Twitch account</h3>
      {mock ? (
        <p className={formStyles.help}>Mock mode: fake data, no Twitch connection.</p>
      ) : (
        <>
          <div className={formStyles.row} style={{ marginBottom: 12 }}>
            <span style={{ flex: 1 }}>
              {status === 'authenticated' && user ? (
                <>
                  Logged in as <strong>{user.displayName}</strong>
                </>
              ) : status === 'expired' ? (
                'Your login expired.'
              ) : (
                'Not logged in.'
              )}
            </span>
            {status === 'authenticated' ? (
              <>
                <Button size="small" onClick={() => startLogin(clientId, { forceVerify: true })}>
                  Switch account
                </Button>
                <Button size="small" variant="danger" onClick={() => void logout(clientId)}>
                  Log out
                </Button>
              </>
            ) : (
              <LoginButton />
            )}
          </div>
          {desktop && (
            <div className={formStyles.row} style={{ marginBottom: 12 }}>
              <span className={formStyles.help} style={{ flex: 1 }}>
                For Turbo or sub benefits (no ads) inside the players, sign in to twitch.tv once in
                the app too.
              </span>
              <Button size="small" onClick={() => void desktop?.openTwitchSignIn()}>
                Sign in to Twitch players
              </Button>
            </div>
          )}
          <Field
            label="Client ID"
            help={
              <>
                From your app in the Twitch developer console. Its OAuth Redirect URL must be{' '}
                <code>{redirectUri()}</code>.
              </>
            }
          >
            <input
              className={formStyles.input}
              value={s.clientId}
              placeholder={clientId ? `${clientId} (from .env.local)` : 'Paste your Client ID'}
              onChange={(e) => s.update({ clientId: e.target.value.trim() })}
            />
          </Field>
        </>
      )}

      <h3 className={formStyles.section}>Layout</h3>
      <Field label={`Gap between streams: ${s.tileGap}px`}>
        <input
          type="range"
          min={0}
          max={12}
          value={s.tileGap}
          onChange={(e) => s.update({ tileGap: Number(e.target.value) })}
          style={{ accentColor: 'var(--accent)' }}
        />
      </Field>
      <Checkbox
        checked={s.clickToFocus}
        onChange={(v) => s.update({ clickToFocus: v })}
        label="Click a stream to make it the main one"
        help="In focus layout, clicking one of the small streams swaps it into the big spot."
      />
      <Checkbox
        checked={s.hideOffline}
        onChange={(v) => s.update({ hideOffline: v })}
        label="Hide offline channels"
        help="Their space goes to the live streams; they pop back in when they go live."
      />

      <h3 className={formStyles.section}>Audio</h3>
      <Field
        label="When you pick a stream to hear, the others are…"
        help="Also switchable in the top bar."
      >
        <select
          className={formStyles.input}
          value={audioMode}
          onChange={(e) => useViewStore.getState().setAudioMode(e.target.value as AudioMode)}
        >
          <option value="solo">Muted (solo)</option>
          <option value="duck">Quiet in the background (duck)</option>
          <option value="mix">Left as they are (mix several)</option>
        </select>
      </Field>
      <Field label={`Background volume in duck mode: ${Math.round(s.duckLevel * 100)}%`}>
        <input
          type="range"
          min={5}
          max={50}
          step={5}
          value={Math.round(s.duckLevel * 100)}
          onChange={(e) => s.update({ duckLevel: Number(e.target.value) / 100 })}
          style={{ accentColor: 'var(--accent)' }}
        />
      </Field>
      <Checkbox
        checked={s.audioFollowsMain}
        onChange={(v) => s.update({ audioFollowsMain: v })}
        label="Hear the main stream in focus layout"
      />
      <Checkbox
        checked={s.chatFollowsAudio}
        onChange={(v) => s.update({ chatFollowsAudio: v })}
        label="Chat follows the stream you're hearing"
      />

      <h3 className={formStyles.section}>Go-live alerts</h3>
      <LiveAlertSettings />

      {desktop && (
        <>
          <h3 className={formStyles.section}>App updates</h3>
          <AppUpdates />
        </>
      )}

      <h3 className={formStyles.section}>Performance</h3>
      <Field label="Stream quality">
        <select
          className={formStyles.input}
          value={s.qualityMode}
          onChange={(e) => s.update({ qualityMode: e.target.value as QualityMode })}
        >
          <option value="auto">Let Twitch decide (auto)</option>
          <option value="fit">Match each tile's size (saves bandwidth and CPU)</option>
        </select>
      </Field>
      <Field label="Refresh live channels every">
        <select
          className={formStyles.input}
          value={s.refreshSeconds}
          onChange={(e) => s.update({ refreshSeconds: Number(e.target.value) })}
        >
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={120}>2 minutes</option>
          <option value={300}>5 minutes</option>
        </select>
      </Field>

      <div className={formStyles.row} style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <Button size="small" variant="ghost" onClick={() => s.reset()}>
          Reset settings to defaults
        </Button>
      </div>
    </>
  );
}

function LiveAlertSettings() {
  const liveAlerts = useSettings((s) => s.liveAlerts);
  const update = useSettings((s) => s.update);
  const [permission, setPermission] = useState(notificationPermission);
  return (
    <>
      <Field
        label="Notify me when…"
        help="Checked every time the live list refreshes, while the app is open. Star channels in the sidebar to make them favorites."
      >
        <select
          className={formStyles.input}
          value={liveAlerts}
          onChange={(e) => update({ liveAlerts: e.target.value as LiveAlertMode })}
        >
          <option value="favorites">A favorite goes live</option>
          <option value="all">Anyone I follow goes live</option>
          <option value="off">Never</option>
        </select>
      </Field>
      {liveAlerts !== 'off' && permission !== 'granted' && (
        <div className={formStyles.row} style={{ marginBottom: 12 }}>
          <span className={formStyles.help} style={{ flex: 1 }}>
            {permission === 'denied'
              ? 'Notifications are blocked for this app in the browser, so alerts appear inside the app only. Allow them via the lock/site icon next to the address, or the browser’s site settings.'
              : permission === 'unsupported'
                ? 'This browser can’t show notifications; alerts appear inside the app only.'
                : 'Allow notifications to get alerts even when the app window is in the background.'}
          </span>
          {permission === 'default' && (
            <Button size="small" onClick={() => void requestNotifications().then(setPermission)}>
              Allow notifications
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function AppUpdates() {
  const status = useUpdateStatus();
  const [checking, setChecking] = useState(false);
  const short = (sha?: string | null) => (sha ? sha.slice(0, 7) : '');
  const text = !status
    ? ''
    : status.state === 'dev'
      ? 'Running from source code: update with git pull.'
      : status.state === 'checking'
        ? 'Checking GitHub…'
        : status.state === 'up-to-date'
          ? 'You have the latest version.'
          : status.state === 'available'
            ? `A newer version is on GitHub${status.latestMessage ? `: “${status.latestMessage}”` : ''}.`
            : `Couldn’t check for updates (${status.error ?? 'offline?'}).`;
  return (
    <div className={formStyles.row} style={{ marginBottom: 12, alignItems: 'flex-start' }}>
      <span className={formStyles.help} style={{ flex: 1 }}>
        Version {desktop?.version}
        {status?.current ? ` (${short(status.current)})` : ''}. {text} Updates are built on this PC
        from the latest code on GitHub; it takes a few minutes and the app reopens by itself.
      </span>
      {status?.state === 'available' ? (
        <Button size="small" variant="primary" onClick={() => desktop?.installUpdate()}>
          Update now
        </Button>
      ) : (
        status?.state !== 'dev' && (
          <Button
            size="small"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              void desktop?.checkForUpdates().finally(() => setChecking(false));
            }}
          >
            Check now
          </Button>
        )
      )}
    </div>
  );
}
