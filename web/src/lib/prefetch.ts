import type { AnyRouter } from '@tanstack/react-router';
import { account, type Folder, type MessageRow } from './appwrite';
import { FOLDERS } from './folders';
import {
  contactsQuery,
  draftsQuery,
  labelsQuery,
  makeView,
  messagesQuery,
  prefetchFolder,
  prefetchThread,
  queryClient,
  settingsQuery,
} from './queries';

const idle = (fn: () => void) =>
  'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200);

/**
 * Loads everything the user is likely to open next while the app is idle, so
 * switching mailboxes, opening mail and visiting Settings never waits on the
 * network.
 */
export function warmUp(uid: string, router: AnyRouter) {
  // Stop as soon as the session this warm-up started for is gone.
  const alive = () => queryClient.getQueryData<{ $id: string }>(['account'])?.$id === uid;
  idle(async () => {
    if (!alive()) return;
    await Promise.allSettled([
      queryClient.prefetchQuery(labelsQuery(uid)),
      queryClient.prefetchQuery(settingsQuery(uid)),
      queryClient.prefetchQuery(contactsQuery(uid)),
      queryClient.prefetchQuery(draftsQuery(uid)),
    ]);
    // Route code for every screen.
    for (const to of ['/mail/settings', '/mail/contacts'] as const) router.preloadRoute({ to }).catch(() => {});

    if (!alive()) return;
    const inbox = await queryClient.fetchInfiniteQuery({ ...messagesQuery(uid, makeView('inbox')), staleTime: 30_000 }).catch(() => null);
    // The first few conversations, ready to open instantly.
    inbox?.pages[0]?.rows.slice(0, 8).forEach((r: MessageRow) => prefetchThread(uid, r.threadId));

    for (const f of FOLDERS) {
      if (!alive()) return;
      if (f.id !== 'inbox' && f.id !== 'drafts') await prefetchFolder(uid, makeView(f.id as Folder)).catch(() => {});
    }
    queryClient.prefetchQuery({ queryKey: ['sessions'], queryFn: () => account.listSessions(), staleTime: 60_000 });
  });
}
