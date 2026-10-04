import { redirectUri } from '@/config/appConfig';
import { desktop } from '@/lib/desktop/bridge';
import { useClientId, useServices } from '@/app/servicesContext';
import { useAuth } from '@/state/authStore';
import { useState } from 'react';
import type { LiveAlertMode } from '@/lib/alerts/goLive';
import type { AudioMode } from '@/lib/view/types';
import type { QualityChoice } from '@/lib/player/quality';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Checkbox, Field } from '@/ui/Form';
import formStyles from '@/ui/Form.module.css';
import { TabPanel, Tabs, type Tab } from '@/ui/Tabs';
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

  const [tab, setTab] = useState<SettingsTab>('layout');

  return (
    <>
      <Tabs<SettingsTab>
        tabs={settingsTabs()}
        active={tab}
        onChange={setTab}
        label="Settings sections"
      />
      {tab === 'account' && (
        <TabPanel id="account">
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
                    <Button
                      size="small"
                      onClick={() => startLogin(clientId, { forceVerify: true })}
                    >
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
                    For Turbo or sub benefits (no ads) inside the players, sign in to twitch.tv once
                    in the app too.
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
        </TabPanel>
      )}
      {tab === 'layout' && (
        <TabPanel id="layout">
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
            label="Click a stream to make it the main one (or, in grid, the one you hear)"
            help="Focus layout: a small stream moves into the big spot. Grid with Solo or Duck: the stream you click becomes the one you hear. Clicking a paused stream just plays it."
          />
          <Checkbox
            checked={s.rightClickCloses}
            onChange={(v) => s.update({ rightClickCloses: v })}
            label="Right-click a stream to close it"
            help="Any stream, including the main one. Right-click its bar, or its video in the desktop app. Undo brings it back."
          />
          <Checkbox
            checked={s.hideOffline}
            onChange={(v) => s.update({ hideOffline: v })}
            label="Hide offline channels"
            help="Their space goes to the live streams; they pop back in when they go live."
          />
          <Checkbox
            checked={s.dropOfflineStreams}
            onChange={(v) => s.update({ dropOfflineStreams: v })}
            label="Remove streams that go offline (temporary views)"
            help="A view you put together is temporary: a stream that goes offline for about 1½ minutes is removed (with Undo). Views loaded or saved as a preset keep their streams. Switch per view in Presets."
          />
        </TabPanel>
      )}
      {tab === 'players' && (
        <TabPanel id="players">
          <QualitySettings />
          <Checkbox
            checked={s.bandwidthSaving}
            onChange={(v) => s.update({ bandwidthSaving: v })}
            label="Automatic bandwidth saving"
            help="When the connection struggles, reduce background quality and temporarily pause muted streams. Turn off to keep your selected quality and playback."
          />
          {desktop && (
            <Checkbox
              checked={s.hideStreamInfo}
              onChange={(v) => s.update({ hideStreamInfo: v })}
              label="Hide Twitch's stream info on the players"
              help="Hides the channel name, title and Follow/Subscribe/Gift buttons Twitch shows at the top of a player. Its play, volume and fullscreen buttons stay."
            />
          )}
          {desktop && (
            <Checkbox
              checked={s.skipContentWarning}
              onChange={(v) => s.update({ skipContentWarning: v })}
              label="Skip Twitch's “intended for certain audiences” notice"
              help="Clicks Start Watching for you, so those streams play straight away."
            />
          )}
        </TabPanel>
      )}
      {tab === 'audio' && (
        <TabPanel id="audio">
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
            checked={s.consistentVolume}
            onChange={(v) => s.update({ consistentVolume: v })}
            label="Consistent volume"
            help="Switching streams keeps the same loudness: one master volume for whatever you hear. Balance loud or quiet streamers in the Mixer (top bar)."
          />
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
        </TabPanel>
      )}
      {tab === 'alerts' && (
        <TabPanel id="alerts">
          <LiveAlertSettings />
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
        </TabPanel>
      )}
      {tab === 'app' && (
        <TabPanel id="app">
          {desktop && <AppUpdates />}
          <div className={formStyles.row} style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <Button size="small" variant="ghost" onClick={() => s.reset()}>
              Reset settings to defaults
            </Button>
          </div>
        </TabPanel>
      )}
    </>
  );
}

type SettingsTab = 'account' | 'layout' | 'players' | 'audio' | 'alerts' | 'app';

const settingsTabs = (): Tab<SettingsTab>[] => [
  { id: 'layout', label: 'Layout' },
  { id: 'players', label: 'Players' },
  { id: 'audio', label: 'Audio' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'account', label: 'Account' },
  { id: 'app', label: desktop ? 'App & updates' : 'App' },
];

const QUALITY_LABELS: Record<QualityChoice, string> = {
  auto: 'Let Twitch decide (auto)',
  source: 'Best (source)',
  fit: 'Match the tile size',
  '720p': 'At most 720p',
  '480p': 'At most 480p',
  '360p': 'At most 360p',
  '160p': 'At most 160p',
};

function QualitySelect({
  value,
  onChange,
  choices,
}: {
  value: QualityChoice;
  onChange(v: QualityChoice): void;
  choices: QualityChoice[];
}) {
  return (
    <select
      className={formStyles.input}
      value={value}
      onChange={(e) => onChange(e.target.value as QualityChoice)}
    >
      {choices.map((c) => (
        <option key={c} value={c}>
          {QUALITY_LABELS[c]}
        </option>
      ))}
    </select>
  );
}

function QualitySettings() {
  const mainQuality = useSettings((s) => s.mainQuality);
  const otherQuality = useSettings((s) => s.otherQuality);
  const update = useSettings((s) => s.update);
  return (
    <>
      <Field
        label="Main stream quality"
        help="The big stream in focus layout; in grid, the one you're listening to."
      >
        <QualitySelect
          value={mainQuality}
          onChange={(v) => update({ mainQuality: v })}
          choices={['source', 'auto', 'fit', '720p']}
        />
      </Field>
      <Field
        label="Other streams quality"
        help="Smaller streams rarely need full resolution; lower saves bandwidth and CPU. Changes apply within a second or two."
      >
        <QualitySelect
          value={otherQuality}
          onChange={(v) => update({ otherQuality: v })}
          choices={['fit', '720p', '480p', '360p', '160p', 'auto', 'source']}
        />
      </Field>
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
          : status.state === 'installing'
            ? 'Updating: a window shows the progress; the app reopens by itself.'
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
        status?.state !== 'dev' &&
        status?.state !== 'installing' && (
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
