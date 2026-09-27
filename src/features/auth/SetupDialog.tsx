import { useState } from 'react';
import { Copy } from 'lucide-react';
import { redirectUri, TWITCH_CONSOLE_URL } from '@/config/appConfig';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { toast } from '@/state/toastStore';
import { Button, IconButton } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Form';
import formStyles from '@/ui/Form.module.css';
import { startLogin } from './authFlow';

/** First-run help for registering a (free) Twitch application. */
export function SetupDialog() {
  const open = useUi((s) => s.dialog === 'setup');
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog open={open} title="Connect to Twitch (one-time setup)" onClose={close} width={600}>
      {open && <SetupForm onDone={close} />}
    </Dialog>
  );
}

function SetupForm({ onDone }: { onDone(): void }) {
  const current = useSettings((s) => s.clientId);
  const [clientId, setClientId] = useState(current);
  const uri = redirectUri();
  const valid = /^[a-z0-9]{20,40}$/i.test(clientId.trim());

  return (
    <>
      <ol className={formStyles.steps}>
        <li>
          Open the{' '}
          <a href={TWITCH_CONSOLE_URL} target="_blank" rel="noreferrer">
            Twitch developer console
          </a>{' '}
          and log in with your Twitch account (Twitch asks for two-factor authentication to be
          turned on).
        </li>
        <li>
          Register an application: any unique <strong>Name</strong> (e.g. “yourname-multi-viewer”),
          category <strong>Website Integration</strong>, client type <strong>Public</strong>.
        </li>
        <li>
          Set the <strong>OAuth Redirect URL</strong> to exactly:
          <div className={formStyles.row} style={{ marginTop: 6 }}>
            <code className={formStyles.code}>{uri}</code>
            <IconButton
              label="Copy"
              icon={<Copy size={16} />}
              onClick={() => navigator.clipboard.writeText(uri).then(() => toast('Copied'))}
            />
          </div>
        </li>
        <li>
          Click <strong>Create</strong>, then <strong>Manage</strong>, and copy the{' '}
          <strong>Client ID</strong> (you do not need the secret).
        </li>
      </ol>
      <Field
        label="Client ID"
        help="Stored only in this browser. You can also put it in .env.local (see README)."
      >
        <input
          className={formStyles.input}
          value={clientId}
          onChange={(e) => setClientId(e.target.value.trim())}
          placeholder="e.g. abcd1234efgh5678ijkl9012mnop"
          data-testid="client-id"
        />
      </Field>
      <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Later</Button>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() => {
            useSettings.getState().update({ clientId: clientId.trim() });
            startLogin(clientId.trim());
          }}
        >
          Save and log in
        </Button>
      </div>
    </>
  );
}
