import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { checkForUpdate, DOWNLOAD_URL, RELEASES_URL } from '@/lib/launcher/updates';
import { appStore } from '@/lib/persistence/keyValueStore';
import { Button, IconButton } from '@/ui/Button';
import styles from './UpdateBanner.module.css';

const CHECK_EVERY = 6 * 60 * 60 * 1000;
const DISMISSED_KEY = 'update-dismissed';

/**
 * In the Windows app, offers a newer MultiTwitchViewer.exe when one has been
 * released. Does nothing under `npm start`/`npm run dev`.
 */
export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const status = await checkForUpdate();
      if (cancelled) return;
      if (status.kind === 'available' && appStore.getItem(DISMISSED_KEY) !== status.latestCommit) {
        setLatest(status.latestCommit);
      }
    };
    void run();
    const id = setInterval(run, CHECK_EVERY);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!latest) return null;
  return (
    <div className={styles.banner} role="status" data-testid="update-banner">
      <div className={styles.text}>
        <strong>A new version of Multi Twitch Viewer is available</strong>
        <span>
          Download it, close this window, and replace your old MultiTwitchViewer.exe with it.{' '}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            What’s new
          </a>
        </span>
      </div>
      <Button
        variant="primary"
        size="small"
        onClick={() => window.open(DOWNLOAD_URL, '_blank', 'noopener')}
      >
        <Download size={14} /> Download
      </Button>
      <IconButton
        size="sm"
        label="Not now"
        icon={<X size={16} />}
        onClick={() => {
          appStore.setItem(DISMISSED_KEY, latest);
          setLatest(null);
        }}
      />
    </div>
  );
}
