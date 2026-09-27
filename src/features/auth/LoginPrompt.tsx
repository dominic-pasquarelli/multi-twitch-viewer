import { useClientId } from '@/app/servicesContext';
import { useUi } from '@/state/uiStore';
import { Button } from '@/ui/Button';
import { startLogin } from './authFlow';

/** "Log in with Twitch", or "Set up" when no Client ID is configured yet. */
export function LoginButton({ label = 'Log in with Twitch' }: { label?: string }) {
  const clientId = useClientId();
  const openDialog = useUi((s) => s.openDialog);
  return clientId ? (
    <Button variant="primary" onClick={() => startLogin(clientId)}>
      {label}
    </Button>
  ) : (
    <Button variant="primary" onClick={() => openDialog('setup')}>
      Set up Twitch login
    </Button>
  );
}
