import styles from './Kick.module.css';

/** Platform marker for direct Kick channels and linked fallback playback. */
export function KickBadge() {
  return (
    <span className={styles.badge} title="Kick channel" data-testid="kick-badge">
      Kick
    </span>
  );
}
