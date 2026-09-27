import type { ReactNode } from 'react';
import styles from './Form.module.css';

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
      {help && <span className={styles.help}>{help}</span>}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
  help?: ReactNode;
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className={styles.label}>{label}</span>
        {help && <div className={styles.help}>{help}</div>}
      </span>
    </label>
  );
}
