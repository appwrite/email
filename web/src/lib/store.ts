import { useSyncExternalStore } from 'react';
import type { Attachment } from './appwrite';

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    use<S>(selector: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(
        store.subscribe,
        () => selector(state),
        () => selector(initial),
      );
    },
  };
  return store;
}

// ---------------------------------------------------------------------------
// Preferences (mirrored to account prefs so they follow the user)
// ---------------------------------------------------------------------------

export type Prefs = {
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  snippets: boolean;
  remoteImages: boolean;
  notifications: boolean;
  sound: boolean;
};

// The system blue is the single accent everywhere.
export const ACCENT = '#007aff';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  density: 'comfortable',
  snippets: true,
  remoteImages: true,
  notifications: false,
  sound: true,
};

const PREFS_KEY = 'ae:prefs';

function loadPrefs(): Prefs {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const prefsStore = createStore<Prefs>(DEFAULT_PREFS);

export function initPrefs() {
  prefsStore.set(loadPrefs());
  applyPrefs();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);
}

export function isDark(p: Prefs = prefsStore.get()) {
  if (p.theme === 'dark') return true;
  if (p.theme === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyPrefs() {
  const p = prefsStore.get();
  const root = document.documentElement;
  const dark = isDark(p);
  root.classList.toggle('dark', dark);
  root.dataset.density = p.density;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1c1e' : '#ffffff');
}

export function updatePrefs(patch: Partial<Prefs>) {
  prefsStore.set(patch);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefsStore.get()));
  } catch {
    // storage may be unavailable
  }
  applyPrefs();
}

// Inline script for <head> so the theme applies before first paint. It follows
// the system appearance by default.
export const THEME_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'{}');var t=p.theme||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.density=p.density||'comfortable';var b=JSON.parse(localStorage.getItem('ae:brand')||'{}');if(b.accent)r.style.setProperty('--brand-accent',b.accent);}catch(e){}})();`;

// ---------------------------------------------------------------------------
// Composer windows
// ---------------------------------------------------------------------------

export type UploadingAttachment = Attachment & { progress?: number; uploading?: boolean; error?: string };

export type ComposerState = {
  key: string;
  draftId?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  showCc: boolean;
  subject: string;
  html: string;
  attachments: UploadingAttachment[];
  inReplyTo?: string;
  refs?: string[];
  threadId?: string;
  mode: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  minimized: boolean;
  maximized: boolean;
  focus?: 'to' | 'body';
};

export const uiStore = createStore({
  composers: [] as ComposerState[],
  palette: false,
  shortcuts: false,
  sidebarOpen: false,
});

let composerSeq = 0;

export function openComposer(init: Partial<ComposerState> = {}) {
  const existing = init.draftId && uiStore.get().composers.find((c) => c.draftId === init.draftId);
  if (existing) {
    updateComposer(existing.key, { minimized: false });
    return existing.key;
  }
  const key = `c${Date.now()}${composerSeq++}`;
  const composer: ComposerState = {
    key,
    to: [],
    cc: [],
    bcc: [],
    showCc: false,
    subject: '',
    html: '',
    attachments: [],
    mode: 'new',
    minimized: false,
    maximized: false,
    ...init,
  };
  uiStore.set((s) => ({
    composers: [...s.composers.map((c) => ({ ...c, minimized: s.composers.length >= 2 ? true : c.minimized })), composer].slice(-3),
  }));
  return key;
}

export function updateComposer(key: string, patch: Partial<ComposerState>) {
  uiStore.set((s) => ({ composers: s.composers.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
}

export function closeComposer(key: string) {
  uiStore.set((s) => ({ composers: s.composers.filter((c) => c.key !== key) }));
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export type Toast = {
  id: string;
  title: string;
  description?: string;
  tone?: 'default' | 'success' | 'error' | 'progress';
  action?: { label: string; onClick: () => void };
  duration?: number;
};

export const toastStore = createStore({ toasts: [] as Toast[] });

export function toast(t: Omit<Toast, 'id'> & { id?: string }) {
  const id = t.id || `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  toastStore.set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), { ...t, id }].slice(-4) }));
  const duration = t.duration ?? (t.tone === 'error' ? 6000 : 3800);
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id: string) {
  toastStore.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
