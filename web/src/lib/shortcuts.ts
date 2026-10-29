import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { createStore, openComposer, uiStore } from './store';

export type ShortcutHandlers = Partial<
  Record<
    | 'next'
    | 'prev'
    | 'archive'
    | 'trash'
    | 'star'
    | 'read'
    | 'reply'
    | 'replyAll'
    | 'forward'
    | 'spam'
    | 'snooze'
    | 'close'
    | 'search'
    | 'select'
    | 'selectAll',
    () => void
  >
>;

// The active mail view registers what j/k/e/#… should do.
export const shortcutStore = createStore<{ handlers: ShortcutHandlers }>({ handlers: {} });

export function useShortcutHandlers(handlers: ShortcutHandlers) {
  useEffect(() => {
    shortcutStore.set({ handlers });
    return () => shortcutStore.set({ handlers: {} });
  });
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export const SHORTCUTS: [string, string][] = [
  ['C', 'New message'],
  ['/', 'Search'],
  ['⌘ K', 'Command palette'],
  ['J / ↓', 'Next message'],
  ['K / ↑', 'Previous message'],
  ['R', 'Reply'],
  ['A', 'Reply all'],
  ['F', 'Forward'],
  ['E', 'Archive'],
  ['# / ⌫', 'Delete'],
  ['S', 'Star'],
  ['U', 'Toggle read'],
  ['B', 'Snooze'],
  ['X', 'Select message'],
  ['⌘ A', 'Select all'],
  ['!', 'Mark as junk'],
  ['G then I', 'Go to Inbox'],
  ['G then S', 'Go to Sent'],
  ['G then D', 'Go to Drafts'],
  ['G then A', 'Go to Archive'],
  ['⌘ Enter', 'Send message'],
  ['Esc', 'Close message'],
  ['?', 'Show shortcuts'],
];

export function useGlobalShortcuts(enabled: boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) return;
    let pendingG = 0;
    const go = (folder: string) => navigate({ to: '/mail/$folder', params: { folder } });

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        uiStore.set((s) => ({ palette: !s.palette }));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !isTyping(e.target)) {
        const h = shortcutStore.get().handlers;
        if (h.selectAll) {
          e.preventDefault();
          h.selectAll();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || e.defaultPrevented) return;
      if (uiStore.get().palette) return;
      const h = shortcutStore.get().handlers;
      const key = e.key;

      if (Date.now() - pendingG < 1200) {
        pendingG = 0;
        const map: Record<string, string> = { i: 'inbox', s: 'sent', d: 'drafts', a: 'archive', t: 'trash', r: 'starred', z: 'snoozed', l: 'scheduled' };
        if (map[key.toLowerCase()]) {
          e.preventDefault();
          go(map[key.toLowerCase()]);
          return;
        }
      }

      const run = (fn?: () => void) => {
        if (!fn) return;
        e.preventDefault();
        fn();
      };

      switch (key) {
        case 'g':
          pendingG = Date.now();
          break;
        case 'c':
          e.preventDefault();
          openComposer();
          break;
        case '/':
          run(h.search);
          break;
        case '?':
          e.preventDefault();
          uiStore.set({ shortcuts: true });
          break;
        case 'j':
        case 'ArrowDown':
          run(h.next);
          break;
        case 'k':
        case 'ArrowUp':
          run(h.prev);
          break;
        case 'e':
          run(h.archive);
          break;
        case '#':
        case 'Delete':
        case 'Backspace':
          run(h.trash);
          break;
        case 's':
          run(h.star);
          break;
        case 'u':
          run(h.read);
          break;
        case 'r':
          run(h.reply);
          break;
        case 'a':
          run(h.replyAll);
          break;
        case 'f':
          run(h.forward);
          break;
        case '!':
          run(h.spam);
          break;
        case 'b':
          run(h.snooze);
          break;
        case 'x':
          run(h.select);
          break;
        case 'Escape':
          run(h.close);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, navigate]);
}
