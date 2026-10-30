import { Outlet, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { CommandPalette } from '~/components/CommandPalette';
import { ContextMenuHost } from '~/components/ContextMenu';
import { ComposerDock } from '~/components/Composer';
import { ShortcutsHelp } from '~/components/ShortcutsHelp';
import { Sidebar } from '~/components/Sidebar';
import { EmailLockup } from '~/components/brand';
import type { MailboxRow, MessageRow } from '~/lib/appwrite';
import { MailContext, useMailRealtime } from '~/lib/mail-context';
import { restoreCache, startPersisting } from '~/lib/persist';
import { warmUp } from '~/lib/prefetch';
import { fetchAccount, fetchMailbox, queryClient, useContacts, useCounts } from '~/lib/queries';
import { forgetDevice } from '~/lib/session';
import { useGlobalShortcuts } from '~/lib/shortcuts';
import { DEFAULT_PREFS, openComposer, updatePrefs, type Prefs } from '~/lib/store';
import type { Models } from 'appwrite';
import { PenSquare } from 'lucide-react';

export const Route = createFileRoute('/mail')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Mail' }] }),
  component: MailLayout,
  pendingComponent: Splash,
});

// Same frame as the app (sidebar, list, reader), so the first paint never
// jumps when the inbox fills in.
function Splash() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg" aria-busy>
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-sidebar md:block">
        <div className="flex h-[52px] items-center justify-between pl-4 pr-3">
          <EmailLockup size={18} />
          <div className="h-8 w-8 rounded-md bg-accent" />
        </div>
      </aside>
      <section className="flex w-full shrink-0 flex-col border-r border-line bg-surface lg:w-[380px] xl:w-[420px]">
        <div className="h-[95px] shrink-0 border-b border-line bg-chrome" />
      </section>
      <section className="hidden min-w-0 flex-1 bg-surface lg:block" />
    </div>
  );
}

type Session = { user: Models.User<Models.Preferences>; mailbox: MailboxRow };

// The last session on this device, so the app renders before any request.
function cachedSession(): Session | null {
  restoreCache();
  const user = queryClient.getQueryData<Session['user']>(['account']);
  const mailbox = user && queryClient.getQueryData<MailboxRow>(['mailbox', user.$id]);
  return user && mailbox ? { user, mailbox } : null;
}

function MailLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(cachedSession);

  useLayoutEffect(() => {
    document.documentElement.classList.add('app');
    return () => document.documentElement.classList.remove('app');
  }, []);

  useEffect(() => startPersisting(), []);

  // Confirm the session with Appwrite in the background.
  useEffect(() => {
    let active = true;
    (async () => {
      const cached = queryClient.getQueryData<Session['user']>(['account']);
      const user = await fetchAccount();
      if (!active) return;
      if (!user) {
        forgetDevice();
        return navigate({ to: '/login', replace: true });
      }
      if (cached && cached.$id !== user.$id) forgetDevice();
      queryClient.setQueryData(['account'], user);
      const mailbox = await fetchMailbox(user.$id);
      if (!active) return;
      if (!mailbox) return navigate({ to: '/welcome', replace: true });
      queryClient.setQueryData(['mailbox', user.$id], mailbox);
      // Preferences follow the account across devices.
      const remote = (user.prefs as { ui?: Partial<Prefs> }).ui;
      if (remote) updatePrefs({ ...DEFAULT_PREFS, ...remote });
      setSession((s) =>
        s && s.user.$id === user.$id && s.user.$updatedAt === user.$updatedAt && s.mailbox.$updatedAt === mailbox.$updatedAt
          ? s
          : { user, mailbox },
      );
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (session) warmUp(session.user.$id, router);
  }, [session?.user.$id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(
    (row: MessageRow) => navigate({ to: '/mail/$folder', params: { folder: row.folder }, search: { m: row.$id } }),
    [navigate],
  );
  useMailRealtime(session?.user.$id, open);
  useGlobalShortcuts(!!session);

  const counts = useCounts(session?.user.$id);
  // Context menus check whether a sender is already a contact.
  useContacts(session?.user.$id);
  useEffect(() => {
    const unread = counts.data?.inbox || 0;
    document.title = unread ? `Inbox (${unread}) — Mail` : 'Mail';
  }, [counts.data?.inbox]);

  if (!session) return <Splash />;

  return (
    <MailContext.Provider value={session}>
      <div className="flex h-dvh w-full overflow-hidden bg-bg">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1">
          <Outlet />
        </main>
        <button
          onClick={() => openComposer()}
          aria-label="New message"
          className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_30px_-6px_var(--accent)] transition active:scale-95 md:hidden"
        >
          <PenSquare className="h-6 w-6" />
        </button>
      </div>
      <ComposerDock />
      <CommandPalette />
      <ContextMenuHost />
      <ShortcutsHelp />
    </MailContext.Provider>
  );
}
