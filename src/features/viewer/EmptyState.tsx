import type { ReactNode } from 'react';
import { usePresets } from '@/state/presetsStore';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title?: string;
  action?: ReactNode;
}

export function EmptyState({ title, action }: EmptyStateProps) {
  const presets = usePresets((s) => s.presets);
  if (title) {
    return (
      <div className={styles.empty}>
        <div className={styles.card}>
          <h2>{title}</h2>
          <p>They’ll appear here as soon as they go live.</p>
          {action}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.empty}>
      <div className={styles.card}>
        <h2>Nothing playing yet</h2>
        <p>
          Click a live channel in the sidebar, drag one in here, or type channel names (or paste a
          multitwitch link) in the box at the top.
        </p>
        {presets.length > 0 && (
          <>
            <p>Or load a saved preset:</p>
            <div className={styles.presets}>
              {presets.map((p) => (
                <Button key={p.id} onClick={() => useViewStore.getState().loadView(p.view)}>
                  {p.name}
                </Button>
              ))}
            </div>
          </>
        )}
        <div className={styles.tips}>
          Press <kbd>?</kbd> for keyboard shortcuts · <kbd>1</kbd>–<kbd>9</kbd> pick which stream
          you hear · <kbd>L</kbd> switches layouts
        </div>
      </div>
    </div>
  );
}
