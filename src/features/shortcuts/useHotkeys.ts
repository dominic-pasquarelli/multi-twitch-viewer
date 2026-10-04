import { useEffect } from 'react';
import { MIN_MAIN_SCALE } from '@/lib/layout';
import { slotOrder } from '@/lib/view/operations';
import { displayedChannels, streamSections } from '@/lib/view/groups';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { toggleFullscreen } from '../topbar/fullscreen';
import { nudgeHeard, VOLUME_STEP } from '../viewer/volume';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Global keyboard shortcuts (see shortcuts.ts for the list). */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || e.altKey) return;
      const view = useViewStore.getState();
      const ui = useUi.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (view.undo()) e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      if (ui.dialog || document.querySelector('dialog[open]')) return; // let dialogs handle their own keys

      // Digits: e.code keeps working with Shift held (Shift+1 = "!").
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
      if (digit) {
        const login = streamSections(view.view).flatMap((section) =>
          slotOrder(view.view, section.channels),
        )[Number(digit) - 1];
        if (!login) return;
        if (e.shiftKey) {
          if (view.view.audio.mode !== 'mix') view.setAudioMode('mix');
          useViewStore.getState().toggleAudio(login);
        } else view.focusAudio(login);
        e.preventDefault();
        return;
      }

      const scale = view.view.layout.mainScale;
      const step = (delta: number) => {
        const base = scale === 'auto' ? 0.75 : scale;
        view.setMainScale(
          Math.min(1, Math.max(MIN_MAIN_SCALE, Math.round((base + delta) * 20) / 20)),
        );
        if (view.view.layout.mode !== 'focus') view.setLayoutMode('focus');
      };

      const actions: Record<string, () => void> = {
        arrowup: () =>
          nudgeHeard(displayedChannels(view.view, view.view.audio.active), VOLUME_STEP),
        arrowdown: () =>
          nudgeHeard(displayedChannels(view.view, view.view.audio.active), -VOLUME_STEP),
        m: () => view.toggleMuteAll(),
        l: () => view.setLayoutMode(view.view.layout.mode === 'grid' ? 'focus' : 'grid'),
        '[': () => step(-0.05),
        ']': () => step(0.05),
        '\\': () => view.setMainScale('auto'),
        '/': () => ui.requestAddBoxFocus(),
        b: () =>
          useSettings
            .getState()
            .update({ sidebarCollapsed: !useSettings.getState().sidebarCollapsed }),
        c: () => view.setChat({ open: !view.view.chat.open }),
        f: () => void toggleFullscreen(),
        p: () => ui.setPresetsMenuOpen(!ui.presetsMenuOpen),
        '?': () => ui.openDialog('shortcuts'),
      };
      const action = actions[e.key.toLowerCase()] ?? actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
