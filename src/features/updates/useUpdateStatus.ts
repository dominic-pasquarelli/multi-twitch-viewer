import { useEffect, useState } from 'react';
import { desktop, type UpdateStatus } from '@/lib/desktop/bridge';

/** The desktop app's update status (null in the browser version). */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop.getUpdateStatus().then((s) => active && setStatus(s));
    const off = desktop.onUpdateStatus(setStatus);
    return () => {
      active = false;
      off();
    };
  }, []);
  return status;
}
