import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, FileText, Menu, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageList } from '~/components/MessageList';
import { Reader, type ReaderMenus } from '~/components/Reader';
import { Button, Empty, IconButton, Spinner, cx } from '~/components/ui';
import { DATABASE_ID, TABLES, parseAttachments, tablesDB, type Folder, type MessageRow } from '~/lib/appwrite';
import { archive, emptyTrash, forward, reply, setRead, spam, toggleStar, trash } from '~/lib/actions';
import { VALID_FOLDERS } from '~/lib/folders';
import { displayName, listDate, parseAddress } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { findCachedRow, makeView, prefetchThread, queryClient, useDrafts, useSettings, type View } from '~/lib/queries';
import { useShortcutHandlers } from '~/lib/shortcuts';
import { openComposer, uiStore } from '~/lib/store';

type Search = { m?: string; q?: string; filter?: View['filter']; label?: string };

export const Route = createFileRoute('/mail/$folder')({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): Search => ({
    m: typeof s.m === 'string' ? s.m : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    filter: ['unread', 'attachments', 'starred'].includes(s.filter as string) ? (s.filter as View['filter']) : undefined,
    label: typeof s.label === 'string' ? s.label : undefined,
  }),
  component: FolderView,
});

function FolderView() {
  const { folder } = Route.useParams();
  const search = Route.useSearch();
  if (!VALID_FOLDERS.has(folder)) return <Empty icon={<FileText />} title="Unknown mailbox" />;
  if (folder === 'drafts') return <DraftsView />;
  return <MailboxView folder={folder as Folder} search={search} />;
}

function MailboxView({ folder, search }: { folder: Folder; search: Search }) {
  const navigate = useNavigate();
  const { mailbox, user } = useMail();
  const settings = useSettings(user.$id).data;
  const view = useMemo<View>(
    () => makeView(folder, { label: search.label, q: search.q, filter: search.filter }),
    [folder, search.label, search.q, search.filter],
  );
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menusRef = useRef<ReaderMenus | null>(null);

  useEffect(() => {
    setSelection(new Set());
    setSelectMode(false);
  }, [folder, search.label, search.q]);
  const endSelection = () => {
    setSelection(new Set());
    setSelectMode(false);
  };

  const setSearch = useCallback(
    (patch: Partial<Search>) => navigate({ to: '/mail/$folder', params: { folder }, search: (s: Search) => ({ ...s, ...patch }), replace: true }),
    [navigate, folder],
  );
  const open = useCallback((row: MessageRow) => setSearch({ m: row.$id }), [setSearch]);
  const close = useCallback(() => setSearch({ m: undefined }), [setSearch]);

  // Rows currently visible in the list, for j/k navigation.
  const listRows = (): MessageRow[] => {
    const data = queryClient.getQueryData<{ pages: { rows: MessageRow[] }[] }>(['messages', user.$id, view]);
    return data?.pages.flatMap((p) => p.rows) || [];
  };

  const step = (dir: 1 | -1) => {
    const rows = listRows();
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.$id === search.m);
    const next = rows[Math.min(rows.length - 1, Math.max(0, i < 0 ? 0 : i + dir))];
    if (next) open(next);
  };

  // After archiving/deleting the open message, move to the next one like Mail does.
  const afterRemove = (ids: string[]) => {
    const rows = listRows();
    const i = rows.findIndex((r) => r.$id === search.m);
    const rest = rows.filter((r) => !ids.includes(r.$id));
    const next = rest[Math.min(i, rest.length - 1)];
    if (next && i >= 0) open(next);
    else close();
  };

  // Keep the conversations on either side warm for J/K.
  useEffect(() => {
    if (!search.m) return;
    const rows = listRows();
    const i = rows.findIndex((r) => r.$id === search.m);
    for (const r of [rows[i - 1], rows[i + 1], rows[i + 2]]) if (r) prefetchThread(user.$id, r.threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.m]);

  const targetIds = () => (selection.size ? [...selection] : search.m ? [search.m] : []);
  const current = () => (search.m ? findCachedRow(search.m) : undefined);

  useShortcutHandlers({
    next: () => step(1),
    prev: () => step(-1),
    search: () => searchRef.current?.focus(),
    close: () => (selection.size || selectMode ? endSelection() : close()),
    select: () => {
      if (!search.m) return;
      const next = new Set(selection);
      if (next.has(search.m)) next.delete(search.m);
      else next.add(search.m);
      setSelection(next);
    },
    selectAll: () => {
      const rows = listRows();
      const all = rows.length > 0 && rows.every((r) => selection.has(r.$id));
      setSelection(all ? new Set() : new Set(rows.map((r) => r.$id)));
    },
    archive: () => {
      const ids = targetIds();
      if (!ids.length) return;
      archive(ids);
      afterRemove(ids);
      endSelection();
    },
    trash: () => {
      const ids = targetIds();
      if (!ids.length) return;
      trash(ids);
      afterRemove(ids);
      endSelection();
    },
    spam: () => {
      const ids = targetIds();
      if (!ids.length) return;
      spam(ids, folder !== 'spam');
      afterRemove(ids);
      endSelection();
    },
    star: () => targetIds().length && toggleStar(targetIds()),
    read: () => {
      const ids = targetIds();
      const row = current();
      if (ids.length) setRead(ids, row ? !row.read : true);
    },
    reply: () => {
      const row = current();
      if (row) reply(row, mailbox, false, settings?.signature);
    },
    replyAll: () => {
      const row = current();
      if (row) reply(row, mailbox, true, settings?.signature);
    },
    forward: () => {
      const row = current();
      if (row) forward(row, settings?.signature);
    },
    snooze: () => menusRef.current?.snooze(),
  });

  const reading = !!search.m;
  return (
    <div className="flex min-w-0 flex-1">
      <section
        className={cx(
          'relative flex w-full shrink-0 flex-col border-r border-line bg-surface lg:w-[380px] xl:w-[420px]',
          reading && 'max-lg:hidden',
        )}
      >
        {folder === 'trash' || folder === 'spam' ? (
          <div className="flex items-center justify-between gap-2 border-b border-line bg-fill px-4 py-2 text-[12.5px] text-fg-2">
            <span>{folder === 'trash' ? 'Messages in Trash are deleted after 30 days.' : 'Junk is cleared with Trash.'}</span>
            <Button size="sm" variant="plain" onClick={() => emptyTrash()}>
              Empty
            </Button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <MessageList
            view={view}
            selectedId={search.m}
            selection={selection}
            setSelection={setSelection}
            selectMode={selectMode}
            setSelectMode={setSelectMode}
            onOpen={open}
            onSearch={(q) => setSearch({ q: q || undefined, m: undefined })}
            onFilter={(filter) => setSearch({ filter, m: undefined })}
            searchRef={searchRef}
          />
        </div>
      </section>
      <section className={cx('flex min-w-0 flex-1 bg-surface', !reading && 'max-lg:hidden')}>
        {selection.size > 0 ? (
          <Empty icon={<CheckCircle2 />} title={`${selection.size} ${selection.size === 1 ? 'message' : 'messages'} selected`}>
            Use the toolbar above the list, or E to archive, # to delete and ! for junk.
          </Empty>
        ) : (
          <Reader key={search.m || 'none'} messageId={search.m} onClose={close} menusRef={menusRef} />
        )}
      </section>
    </div>
  );
}

function DraftsView() {
  const { user } = useMail();
  const drafts = useDrafts(user.$id);
  const rows = drafts.data || [];
  return (
    <div className="relative flex min-w-0 flex-1 flex-col bg-surface">
      <header className="flex h-[52px] shrink-0 items-center gap-1 border-b border-line bg-chrome px-3">
        <IconButton label="Mailboxes" className="md:hidden" onClick={() => uiStore.set({ sidebarOpen: true })}>
          <Menu className="h-5 w-5" />
        </IconButton>
        <div className="pl-1">
          <h1 className="font-display font-bold text-[19px] leading-tight tracking-[-0.01em]">Drafts</h1>
          <div className="text-[11.5px] leading-tight text-fg-3">{rows.length} {rows.length === 1 ? 'draft' : 'drafts'} · saved automatically</div>
        </div>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto">
        {drafts.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="text-fg-3" />
          </div>
        ) : !rows.length ? (
          <Empty overlay icon={<FileText />} title="No drafts">
            Messages you start writing are saved here automatically.
          </Empty>
        ) : (
          <ul className="mx-auto max-w-3xl p-2">
            {rows.map((d) => (
              <li key={d.$id}>
                <button
                  onClick={() =>
                    openComposer({
                      mode: 'draft',
                      draftId: d.$id,
                      to: d.to,
                      cc: d.cc,
                      bcc: d.bcc,
                      showCc: d.cc.length + d.bcc.length > 0,
                      subject: d.subject,
                      html: d.html,
                      attachments: parseAttachments(d.attachments),
                      inReplyTo: d.inReplyTo,
                      refs: (d.refs || '').split(/\s+/).filter(Boolean),
                      threadId: d.threadId,
                    })
                  }
                  className="group flex w-full items-start gap-3 rounded-md px-3 py-3 text-left hover:bg-fill"
                >
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 truncate text-[14px] font-semibold text-danger">
                        Draft
                        <span className="ml-2 font-medium text-fg">{d.to.map((t) => displayName(parseAddress(t))).join(', ') || 'No recipients'}</span>
                      </span>
                      <span className="text-[12px] text-fg-3">{listDate(d.$updatedAt)}</span>
                    </div>
                    <div className="truncate text-[13.5px]">{d.subject || '(no subject)'}</div>
                    <div className="truncate text-[13px] text-fg-2">{d.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ' '}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={async (e) => {
                      e.stopPropagation();
                      await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.drafts, rowId: d.$id });
                      queryClient.invalidateQueries({ queryKey: ['drafts'] });
                      queryClient.invalidateQueries({ queryKey: ['counts'] });
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 opacity-0 hover:bg-fill-2 hover:text-danger group-hover:opacity-100"
                    aria-label="Delete draft"
                  >
                    <Trash2 className="h-4 w-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
