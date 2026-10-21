import styles from './Kick.module.css';

/** Marks a stream that is playing from Kick (its Twitch channel is offline). */
export function KickBadge() {
  return (
    <span className={styles.badge} title="Live on Kick" data-testid="kick-badge">
      Kick
    </span>
  );
}
