import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  CalendarClock,
  Check,
  Clock,
  FolderInput,
  ListFilter,
  Mail,
  MailOpen,
  Menu,
  Minus,
  Paperclip,
  RefreshCw,
  Search,
  Star,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { LabelRow, MessageRow } from '~/lib/appwrite';
import { archive, moveTo, setRead, spam, toggleLabel, toggleStar, trash } from '~/lib/actions';
import { FOLDERS, FOLDER_LABELS, folderIcon } from '~/lib/folders';
import { displayName, listDate, parseAddress, relativeTime } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { prefetchThread, queryClient, useCounts, useLabels, useMessages, type View } from '~/lib/queries';
import { prefsStore, uiStore } from '~/lib/store';
import { DRAG_TYPE } from './Sidebar';
import { Avatar, Empty, IconButton, Kbd, warmAvatars, MenuItem, MenuLabel, MenuSeparator, Popover, Spinner, cx } from './ui';

export function MessageList({
  view,
  selectedId,
  selection,
  setSelection,
  selectMode,
  setSelectMode,
  onOpen,
  onSearch,
  onFilter,
  searchRef,
}: {
  view: View;
  selectedId?: string;
  selection: Set<string>;
  setSelection: (s: Set<string>) => void;
  selectMode: boolean;
  setSelectMode: (v: boolean) => void;
  onOpen: (row: MessageRow) => void;
  onSearch: (q: string) => void;
  onFilter: (filter: View['filter']) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { user } = useMail();
  const query = useMessages(user.$id, view);
  const labels = useLabels(user.$id).data || [];
  const counts = useCounts(user.$id).data;
  const prefs = prefsStore.use((s) => s);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.rows) || [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.$id, l])), [labels]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLButtonElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const lastClicked = useRef<string | null>(null);
  const [q, setQ] = useState(view.q || '');
  const [refreshing, setRefreshing] = useState(false);
  const loading = useRef(false);

  useEffect(() => setQ(view.q || ''), [view.q]);

  // Resolve sender avatars for the whole page up front, so rows scrolled into
  // view already have their final picture.
  useEffect(() => {
    warmAvatars(rows.map((r) => (view.folder === 'sent' || view.folder === 'scheduled' ? parseAddress(r.to?.[0] || '')?.email : r.fromEmail)));
  }, [rows, view.folder]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  // Keep the selected row in view when navigating with the keyboard.
  useEffect(() => {
    if (selectedId) document.getElementById(`row-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const title = view.folder === 'label' ? labelMap.get(view.label || '')?.name || 'Label' : FOLDER_LABELS[view.folder];
  const unread = view.folder === 'inbox' ? counts?.inbox : undefined;
  // Select mode (or any checked row) turns clicks into toggles, as in Mail on iOS.
  const selecting = selectMode || selection.size > 0;
  const allChecked = rows.length > 0 && rows.every((r) => selection.has(r.$id));

  const toggle = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
    lastClicked.current = id;
  };

  function click(e: MouseEvent, row: MessageRow) {
    if (e.shiftKey && (lastClicked.current || selectedId)) {
      const anchor = lastClicked.current || selectedId!;
      const a = rows.findIndex((r) => r.$id === anchor);
      const b = rows.findIndex((r) => r.$id === row.$id);
      if (a >= 0 && b >= 0) {
        const [s, t] = a < b ? [a, b] : [b, a];
        setSelection(new Set([...selection, ...rows.slice(s, t + 1).map((r) => r.$id)]));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      // The open message joins the selection on the first ⌘-click.
      if (!selection.size && selectedId && selectedId !== row.$id) setSelection(new Set([selectedId, row.$id]));
      else toggle(row.$id);
      lastClicked.current = row.$id;
      return;
    }
    if (selecting) {
      toggle(row.$id);
      return;
    }
    lastClicked.current = row.$id;
    onOpen(row);
  }

  const selectedIds = [...selection];
  const endSelection = () => {
    setSelection(new Set());
    setSelectMode(false);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 shrink-0 border-b border-line bg-chrome">
        <div className="flex h-[52px] items-center gap-1 px-3">
          <IconButton label="Mailboxes" className="md:hidden" onClick={() => uiStore.set({ sidebarOpen: true })}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <div className="min-w-0 flex-1 pl-1">
            <h1 className="truncate font-display font-bold text-[19px] leading-tight tracking-[-0.01em]">{title}</h1>
            <div className="text-[11.5px] leading-tight text-fg-3">
              {selecting ? `${selection.size} selected` : unread ? `${unread} unread` : query.isSuccess ? `${total} ${total === 1 ? 'message' : 'messages'}` : ' '}
            </div>
          </div>
          <button
            onClick={() => (selecting ? endSelection() : setSelectMode(true))}
            className="mr-1 h-7 rounded-md px-2 text-[13px] font-medium text-accent transition-colors hover:bg-fill"
          >
            {selecting ? 'Done' : 'Select'}
          </button>
          <IconButton
            label="Refresh"
            anim="none"
            onClick={() => {
              if (refreshing) return;
              loading.current = true;
              setRefreshing(true);
              queryClient.invalidateQueries({ queryKey: ['messages'] }).finally(() => (loading.current = false));
            }}
          >
            {/* Stops only at the end of a turn, so a fast refresh still completes one spin. */}
            <RefreshCw
              className={cx('h-[17px] w-[17px]', refreshing && 'icon-refreshing')}
              onAnimationIteration={() => !loading.current && setRefreshing(false)}
            />
          </IconButton>
          <IconButton ref={filterRef} label="Filter" active={!!view.filter} onClick={() => setFilterOpen((v) => !v)}>
            <ListFilter className={cx('h-[18px] w-[18px]', view.filter && 'text-accent')} />
          </IconButton>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchor={filterRef.current} placement="bottom-end" width={200}>
            {(
              [
                [undefined, 'All messages', Mail],
                ['unread', 'Unread', MailOpen],
                ['starred', 'Starred', Star],
                ['attachments', 'With attachments', Paperclip],
              ] as const
            ).map(([value, label, Icon]) => (
              <MenuItem
                key={label}
                icon={<Icon />}
                shortcut={view.filter === value ? '✓' : undefined}
                onClick={() => {
                  setFilterOpen(false);
                  onFilter(value);
                }}
              >
                {label}
              </MenuItem>
            ))}
          </Popover>
        </div>
        <div className="px-3 pb-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch(q);
            }}
            className="flex h-8 items-center gap-2 rounded-md border border-line bg-transparent px-2.5 transition-colors focus-within:border-fg-3 dark:border-line-strong dark:bg-fill/50"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQ('');
                  onSearch('');
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder={`Search ${title}`}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
            />
            {!q && <Kbd className="pointer-events-none">/</Kbd>}
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  onSearch('');
                }}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-fg-3 text-surface"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            )}
          </form>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {selecting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="shrink-0 overflow-hidden border-b border-line bg-sunken"
          >
            <SelectionBar
              ids={selectedIds}
              allChecked={allChecked}
              total={rows.length}
              folder={view.folder}
              labels={labels}
              onSelectAll={() => setSelection(allChecked ? new Set() : new Set(rows.map((r) => r.$id)))}
              onDone={endSelection}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain" role="listbox" aria-label={title} aria-multiselectable>
        {query.isLoading ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyFolder view={view} />
        ) : (
          <ul className="pb-24 pt-2">
            {rows.map((row) => (
              <MessageItem
                key={row.$id}
                row={row}
                selected={selecting ? selection.has(row.$id) : row.$id === selectedId}
                selecting={selecting}
                onToggle={toggle}
                labelMap={labelMap}
                compact={prefs.density === 'compact'}
                snippets={prefs.snippets}
                folder={view.folder}
                onClick={click}
                dragIds={selection.has(row.$id) ? selectedIds : [row.$id]}
              />
            ))}
            <div ref={sentinel} className="flex h-16 items-center justify-center">
              {query.isFetchingNextPage && <Spinner className="appear-late text-fg-3" />}
            </div>
          </ul>
        )}
      </div>
    </div>
  );
}

const MessageItem = memo(function MessageItem({
  row,
  selected,
  labelMap,
  compact,
  snippets,
  folder,
  onClick,
  dragIds,
  selecting,
  onToggle,
}: {
  row: MessageRow;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: string) => void;
  labelMap: Map<string, LabelRow>;
  compact: boolean;
  snippets: boolean;
  folder: string;
  onClick: (e: MouseEvent, row: MessageRow) => void;
  dragIds: string[];
}) {
  const outgoing = folder === 'sent' || folder === 'scheduled';
  const counterpart = outgoing ? parseAddress(row.to?.[0] || '') : { name: row.fromName, email: row.fromEmail };
  const who = outgoing
    ? `To: ${(row.to || []).map((t) => displayName(parseAddress(t))).join(', ') || '—'}`
    : displayName(counterpart);
  const rowLabels = (row.labels || []).map((id) => labelMap.get(id)).filter(Boolean) as LabelRow[];
  const FolderIcon = folderIcon(row.folder);

  return (
    <li
      id={`row-${row.$id}`}
      role="option"
      aria-selected={selected}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = 'move';
        const ghost = document.createElement('div');
        ghost.textContent = dragIds.length > 1 ? `${dragIds.length} messages` : row.subject || '(no subject)';
        ghost.style.cssText =
          'position:absolute;top:-1000px;padding:6px 12px;border-radius:999px;background:var(--accent);color:#fff;font:600 13px -apple-system,system-ui;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 12, 12);
        setTimeout(() => ghost.remove(), 0);
      }}
      onClick={(e) => onClick(e, row)}
      onMouseEnter={() => prefetchThread(row.ownerId, row.threadId)}
      className={cx(
        'group relative mx-2 flex cursor-default gap-3 rounded-md px-3 transition-colors duration-75',
        compact ? 'py-2' : 'py-2.5',
        selected ? 'bg-selected' : 'hover:bg-fill',
      )}
    >
      <div className="absolute left-0 top-0 flex h-full w-3 items-start justify-center pt-[19px]">
        {!row.read && !selecting && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </div>
      {/* Select mode slides a check column in beside the avatar, as in Mail's Edit mode. */}
      <div
        className={cx(
          'flex shrink-0 justify-center overflow-hidden transition-[width,margin,opacity] duration-200 ease-apple',
          compact ? 'pt-px' : 'pt-[8px]',
          selecting ? 'w-[22px] opacity-100' : '-mr-3 w-0 opacity-0',
        )}
      >
        <CheckCircle checked={selecting && selected} onToggle={() => onToggle(row.$id)} />
      </div>
      {!compact && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={selected && selecting ? 'Deselect' : 'Select'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(row.$id);
          }}
          className="mt-0.5 h-9 w-9 shrink-0 rounded-full"
        >
          <Avatar name={counterpart.name || counterpart.email} email={counterpart.email} size={36} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cx('flex-1 truncate text-[13.5px] text-fg', !row.read && 'font-semibold')}>{who}</span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-fg-3">
            {folder === 'snoozed' && row.snoozedUntil ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeTime(row.snoozedUntil)}
              </span>
            ) : folder === 'scheduled' && row.scheduledAt ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {relativeTime(row.scheduledAt)}
              </span>
            ) : (
              listDate(row.date)
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cx('flex-1 truncate text-[13px] text-fg', !row.read && 'font-semibold')}>{row.subject || '(no subject)'}</span>
          {row.status === 'failed' && <span className="rounded-md bg-[rgba(239,68,68,0.12)] px-1.5 py-px text-[10.5px] font-medium text-danger">Failed</span>}
          {row.status === 'sending' && <Spinner size={12} className="text-fg-3" />}
          {row.folder !== 'spam' && row.spamReason?.startsWith('unsure') && (
            <span className="rounded-md bg-[rgba(245,158,11,0.12)] px-1.5 py-px text-[10.5px] font-medium text-warning">Possible spam</span>
          )}
          {row.hasAttachments && <Paperclip className="h-3.5 w-3.5 shrink-0 text-fg-3" />}
          {row.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-accent text-accent" />}
          {(folder === 'all' || folder === 'starred' || folder === 'label') && row.folder !== 'inbox' && (
            <FolderIcon className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          )}
        </div>
        {snippets && !compact && (
          <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.4] text-fg-2">{row.snippet || ' '}</div>
        )}
        {rowLabels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {rowLabels.map((l) => (
              <span
                key={l.$id}
                className="inline-flex h-[18px] items-center gap-1 rounded-md px-1.5 text-[11px] font-medium"
                style={{ background: `${l.color}1f`, color: l.color }}
              >
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        className={cx(
          'absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-line bg-elevated p-0.5 shadow-sm dark:border-line-strong',
          !selecting && 'group-hover:flex',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {[
          { label: row.read ? 'Mark unread' : 'Mark read', icon: row.read ? Mail : MailOpen, run: () => setRead([row.$id], !row.read) },
          { label: row.starred ? 'Unstar' : 'Star', icon: Star, run: () => toggleStar([row.$id]) },
          ...(row.folder !== 'archive' ? [{ label: 'Archive', icon: Archive, run: () => archive([row.$id]) }] : []),
          { label: 'Delete', icon: Trash2, run: () => trash([row.$id]) },
        ].map(({ label, icon: Icon, run }) => (
          <IconButton key={label} label={label} size="sm" onClick={run} className="rounded-[5px] hover:bg-fill-2">
            <Icon className="h-[15px] w-[15px]" />
          </IconButton>
        ))}
      </div>
    </li>
  );
});

function CheckCircle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={checked ? 'Deselect' : 'Select'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cx(
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-colors duration-100',
        checked ? 'bg-accent' : 'border-[1.5px] border-fg-3/70 bg-surface hover:border-accent',
      )}
    >
      {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
    </button>
  );
}

function SelectionBar({
  ids,
  allChecked,
  total,
  folder,
  labels,
  onSelectAll,
  onDone,
}: {
  ids: string[];
  allChecked: boolean;
  total: number;
  folder: string;
  labels: LabelRow[];
  onSelectAll: () => void;
  onDone: () => void;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLButtonElement>(null);
  const none = ids.length === 0;
  // Actions that take messages out of this view end the selection.
  const thenDone = (fn: () => unknown) => () => {
    fn();
    onDone();
  };
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5">
      <button onClick={onSelectAll} className="mr-auto flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-[13px] text-fg-2 hover:text-fg" disabled={!total}>
        <span
          className={cx(
            'flex h-[18px] w-[18px] items-center justify-center rounded-full',
            allChecked || ids.length ? 'bg-accent text-white' : 'border-[1.5px] border-fg-3',
          )}
        >
          {allChecked ? <Check className="h-3 w-3" strokeWidth={3.5} /> : ids.length ? <Minus className="h-3 w-3" strokeWidth={3.5} /> : null}
        </span>
        {allChecked ? 'Deselect all' : 'Select all'}
      </button>
      <IconButton label="Mark read" disabled={none} onClick={() => setRead(ids, true)}>
        <MailOpen className="h-[17px] w-[17px]" />
      </IconButton>
      <IconButton label="Mark unread" disabled={none} onClick={() => setRead(ids, false)}>
        <Mail className="h-[17px] w-[17px]" />
      </IconButton>
      <IconButton label="Star" disabled={none} onClick={() => toggleStar(ids)}>
        <Star className="h-[17px] w-[17px]" />
      </IconButton>
      <IconButton ref={moveRef} label="Move to" disabled={none} active={moveOpen} onClick={() => setMoveOpen((v) => !v)}>
        <FolderInput className="h-[17px] w-[17px]" />
      </IconButton>
      <Popover open={moveOpen} onClose={() => setMoveOpen(false)} anchor={moveRef.current} placement="bottom-end" width={210}>
        <MenuLabel>Move to</MenuLabel>
        {FOLDERS.filter((f) => ['inbox', 'archive', 'spam', 'trash'].includes(f.id) && f.id !== folder).map((f) => (
          <MenuItem
            key={f.id}
            icon={<f.icon />}
            onClick={() => {
              setMoveOpen(false);
              moveTo(ids, f.id);
              onDone();
            }}
          >
            {f.label}
          </MenuItem>
        ))}
        {labels.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Label</MenuLabel>
            {labels.map((l) => (
              <MenuItem
                key={l.$id}
                icon={<span className="m-[3px] block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />}
                onClick={() => {
                  setMoveOpen(false);
                  toggleLabel(ids, l.$id);
                }}
              >
                {l.name}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
      <IconButton label={folder === 'spam' ? 'Not junk' : 'Junk'} disabled={none} onClick={thenDone(() => spam(ids, folder !== 'spam'))}>
        <ShieldAlert className="h-[17px] w-[17px]" />
      </IconButton>
      {folder !== 'archive' && (
        <IconButton label="Archive" disabled={none} onClick={thenDone(() => archive(ids))}>
          <Archive className="h-[17px] w-[17px]" />
        </IconButton>
      )}
      <IconButton label="Delete" disabled={none} onClick={thenDone(() => trash(ids))}>
        <Trash2 className="h-[17px] w-[17px] text-danger" />
      </IconButton>
    </div>
  );
}

// Appears only if loading takes noticeably long, so quick loads never flash.
function ListSkeleton() {
  return (
    <div className="appear-late space-y-1 px-2 pt-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2.5" style={{ opacity: 1 - i * 0.09 }}>
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex justify-between">
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-3 w-10" />
            </div>
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-3 w-11/12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyFolder({ view }: { view: View }) {
  if (view.q) {
    return (
      <Empty overlay icon={<Search />} title="No results">
        Nothing matches “{view.q}”. Try fewer words or search All Mail.
      </Empty>
    );
  }
  const map: Record<string, [string, string]> = {
    inbox: ['Inbox zero', 'You’re all caught up. New mail lands here instantly.'],
    starred: ['No starred mail', 'Star important messages to find them fast.'],
    snoozed: ['Nothing snoozed', 'Snooze a message and it comes back when you need it.'],
    sent: ['Nothing sent yet', 'Messages you send appear here.'],
    scheduled: ['Nothing scheduled', 'Use Send Later to deliver at the perfect time.'],
    archive: ['Archive is empty', 'Archived messages are kept here.'],
    spam: ['No junk', 'Messages you mark as junk appear here.'],
    trash: ['Trash is empty', 'Deleted messages stay here for 30 days.'],
    all: ['No mail yet', 'Your messages will show up here.'],
    label: ['No messages', 'Drag messages onto a label to tag them.'],
  };
  const [title, body] = map[view.folder] || ['Empty', ''];
  const Icon = folderIcon(view.folder);
  return (
    <Empty overlay icon={view.folder === 'inbox' ? <Check /> : <Icon />} title={title}>
      {body}
    </Empty>
  );
}
