import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toasts: Toast[];
  show(
    message: string,
    opts?: { tone?: Toast['tone']; action?: Toast['action']; ms?: number },
  ): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastStore>()((set, get) => ({
  toasts: [],
  show: (message, opts = {}) => {
    const id = nextId++;
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-3),
        { id, message, tone: opts.tone ?? 'info', action: opts.action },
      ],
    }));
    setTimeout(() => get().dismiss(id), opts.ms ?? (opts.action ? 6000 : 3500));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (...args: Parameters<ToastStore['show']>) =>
  useToasts.getState().show(...args);
