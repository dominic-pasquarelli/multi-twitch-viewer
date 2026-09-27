import { useToasts } from '@/state/toastStore';
import styles from './Toasts.module.css';

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${t.tone === 'error' ? styles.error : ''}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className={styles.action}
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
