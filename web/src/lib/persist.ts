import { dehydrate, hydrate } from '@tanstack/react-query';
import type { View } from './queries';
import { queryClient } from './queries';

// The last-known mailbox state is kept in localStorage so a reload paints the
// real inbox immediately, then refreshes in the background.
const KEY = 'ae:cache:v1';
const MAX_AGE = 7 * 24 * 3600_000;
const MAX_BYTES = 2_500_000;
const PERSISTED = new Set(['account', 'mailbox', 'settings', 'counts', 'labels', 'contacts', 'drafts', 'messages']);

let restored = false;

export function restoreCache() {
  if (restored || typeof window === 'undefined') return;
  restored = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const { at, state } = JSON.parse(raw);
    if (Date.now() - at > MAX_AGE) return localStorage.removeItem(KEY);
    hydrate(queryClient, state);
  } catch {
    localStorage.removeItem(KEY);
  }
}

function snapshot() {
  // Only persist data that belongs to a signed-in account.
  if (!queryClient.getQueryData(['account'])) return null;
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (q) => {
      if (q.state.status !== 'success' || !PERSISTED.has(q.queryKey[0] as string)) return false;
      // Searches are throwaway; folders and labels are what people come back to.
      return q.queryKey[0] !== 'messages' || !(q.queryKey[2] as View)?.q;
    },
  });
  for (const q of state.queries) {
    const data = q.state.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
    if (q.queryKey[0] === 'messages' && data?.pages) {
      q.state.data = { pages: data.pages.slice(0, 1), pageParams: data.pageParams?.slice(0, 1) };
    }
  }
  return JSON.stringify({ at: Date.now(), state });
}

export function startPersisting() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const json = snapshot();
        if (json && json.length < MAX_BYTES) localStorage.setItem(KEY, json);
      } catch {
        // storage full or unavailable
      }
    }, 800);
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' || event.type === 'removed') save();
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export function clearPersistedCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
