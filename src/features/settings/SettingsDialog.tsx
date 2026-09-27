import { redirectUri } from '@/config/appConfig';
import { useClientId, useServices } from '@/app/servicesContext';
import { useAuth } from '@/state/authStore';
import { useSettings, type QualityMode } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Checkbox, Field } from '@/ui/Form';
import formStyles from '@/ui/Form.module.css';
import { logout, startLogin } from '../auth/authFlow';
import { LoginButton } from '../auth/LoginPrompt';

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
        checked={s.hideOffline}
        onChange={(v) => s.update({ hideOffline: v })}
        label="Hide offline channels"
        help="Their space goes to the live streams; they pop back in when they go live."
      />

      <h3 className={formStyles.section}>Audio</h3>
      <Checkbox
        checked={audioMode === 'solo'}
        onChange={(v) => useViewStore.getState().setAudioMode(v ? 'solo' : 'mix')}
        label="One stream at a time"
        help="Hearing a stream mutes the others — even when you unmute inside a player. Turn off to mix several."
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
