import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'small';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  const classes = [
    styles.button,
    variant !== 'default' && styles[variant],
    size === 'small' && styles.small,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} type={type} className={classes} {...rest} />;
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as a tooltip. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  size?: 'md' | 'sm';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, active, size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  const classes = [styles.icon, active && styles.active, size === 'sm' && styles.sm, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
    >
      {icon}
    </button>
  );
});
