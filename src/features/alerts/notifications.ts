import { desktop } from '@/lib/desktop/bridge';

/** Thin wrapper over the browser Notification API (shows as a Windows toast). */

export type NotifyPermission = NotificationPermission | 'unsupported';

export const notificationPermission = (): NotifyPermission =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

export async function requestNotifications(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/** Shows a notification; returns false when not allowed (caller can fall back). */
export function notify(
  title: string,
  opts: { body: string; icon?: string; tag: string; onClick(): void },
): boolean {
  if (notificationPermission() !== 'granted') return false;
  const n = new Notification(title, {
    body: opts.body,
    icon: opts.icon || undefined,
    tag: opts.tag,
  });
  n.onclick = () => {
    desktop?.showWindow(); // un-hide the desktop app from the tray
    window.focus();
    opts.onClick();
    n.close();
  };
  return true;
}
