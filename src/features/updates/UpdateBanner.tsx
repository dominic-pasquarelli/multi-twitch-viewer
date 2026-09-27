import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { desktop } from '@/lib/desktop/bridge';
import { Button, IconButton } from '@/ui/Button';
import { useUpdateStatus } from './useUpdateStatus';
import styles from './UpdateBanner.module.css';

/** Desktop app: offers the newest version from GitHub (one click to install). */
export function UpdateBanner() {
  const status = useUpdateStatus();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!desktop || !status) return null;
  if (status.state === 'installing') {
    return (
      <div className={styles.banner} role="status" data-testid="update-banner">
        <div className={styles.text}>
          <strong>Updating…</strong>
          <span>
            A window shows the progress (1–2 minutes). The app closes and reopens by itself when the
            new version is ready; keep watching until then.
          </span>
        </div>
      </div>
    );
  }
  if (status.state !== 'available' || dismissed === status.latest) return null;
  return (
    <div className={styles.banner} role="status" data-testid="update-banner">
      <div className={styles.text}>
        <strong>An update is available</strong>
        <span>
          {status.latestMessage ? `“${status.latestMessage}”. ` : ''}The app closes, updates (a few
          minutes) and reopens by itself.
        </span>
      </div>
      <Button variant="primary" size="small" onClick={() => desktop?.installUpdate()}>
        <Download size={14} /> Update now
      </Button>
      <IconButton
        size="sm"
        label="Later"
        icon={<X size={16} />}
        onClick={() => setDismissed(status.latest ?? null)}
      />
    </div>
  );
}
