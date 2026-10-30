import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Copy,
  LogOut,
  MailOpen,
  Monitor,
  Moon,
  Palette,
  PenSquare,
  Plus,
  Settings,
  Sun,
  Tag as TagIcon,
  Trash2,
  Users,
} from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { emptyTrash, markFolderRead } from '~/lib/actions';
import { DATABASE_ID, TABLES, tablesDB } from '~/lib/appwrite';
import { FOLDERS, LABEL_COLORS, LABEL_COLOR_NAMES } from '~/lib/folders';
import { useMail } from '~/lib/mail-context';
import { signOut } from '~/lib/session';
import { createLabel, findCachedRow, makeView, prefetchFolder, queryClient, updateMessages, useCounts, useLabels } from '~/lib/queries';
import { openComposer, prefsStore, toast, uiStore, updatePrefs } from '~/lib/store';
import { EmailLockup } from './brand';
import { openContextMenu } from './ContextMenu';
import { Avatar, IconButton, MenuItem, MenuSeparator, Popover, cx } from './ui';

export const DRAG_TYPE = 'application/x-appwrite-email';

function useDrop(onDrop: (ids: string[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) onDrop(JSON.parse(raw));
      },
    },
  };
}

function NavItem({
  to,
  folder,
  label,
  icon: Icon,
  count,
  active,
  color,
  onDropIds,
  search,
  onHover,
  onMenu,
}: {
  to: string;
  folder?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
  active: boolean;
  color?: string;
  onDropIds?: (ids: string[]) => void;
  search?: Record<string, string>;
  onHover?: () => void;
  onMenu?: (e: React.MouseEvent) => void;
}) {
  const drop = useDrop((ids) => onDropIds?.(ids));
  return (
    <Link
      to={to}
      params={folder ? { folder } : undefined}
      search={search as never}
      onClick={() => uiStore.set({ sidebarOpen: false })}
      onMouseEnter={onHover}
      onContextMenu={onMenu}
      onFocus={onHover}
      {...(onDropIds ? drop.props : {})}
      className={cx(
        'nav-icon-hover group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-75',
        active ? 'bg-fill-2 font-medium text-fg' : 'text-fg-2 hover:bg-fill hover:text-fg',
        drop.over && 'bg-accent-soft text-fg shadow-[inset_0_0_0_1px_var(--accent)]',
      )}
    >
      {color ? (
        <span className="flex h-4 w-4 items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        </span>
      ) : (
        Icon && <Icon className={cx('h-4 w-4 shrink-0', active || drop.over ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2')} />
      )}
      <span className="flex-1 truncate">{label}</span>
      {!!count && <span className={cx('text-[11px] tabular-nums', active ? 'text-fg-2' : 'text-fg-3')}>{count}</span>}
    </Link>
  );
}

export function Sidebar() {
  const { user, mailbox } = useMail();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { folder?: string };
  const search = useSearch({ strict: false }) as { label?: string };
  const pathname = typeof location !== 'undefined' ? location.pathname : '';
  const counts = useCounts(user.$id).data || {};
  const labelsQuery = useLabels(user.$id);
  const labels = labelsQuery.data || [];
  const open = uiStore.use((s) => s.sidebarOpen);
  const theme = prefsStore.use((s) => s.theme);
  const [accountMenu, setAccountMenu] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [newLabel, setNewLabel] = useState<string | null>(null);

  const move = (folder: string) => (ids: string[]) =>
    updateMessages(ids, { folder }).then(() => toast({ title: `Moved ${ids.length} to ${FOLDERS.find((f) => f.id === folder)?.label}`, tone: 'success' }));

  const content = (
    <div className="flex h-full flex-col">
      {/* One search lives above the message list; ⌘K still opens the command palette. */}
      <div className="flex h-[52px] shrink-0 items-center justify-between pl-4 pr-3">
        <Link to="/mail/$folder" params={{ folder: 'inbox' }} aria-label="Inbox">
          <EmailLockup size={18} />
        </Link>
        <IconButton
          label="New message"
          title="New message (C)"
          anim="tilt"
          onClick={() => openComposer()}
          className="bg-accent text-white hover:bg-accent hover:text-white hover:opacity-90 active:bg-accent"
        >
          <PenSquare className="h-4 w-4" />
        </IconButton>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 pb-4">
        <div className="eyebrow no-mark mb-1.5 mt-3 px-2 text-[11.5px] text-fg-3">Mailboxes</div>
        <div className="space-y-px">
          {FOLDERS.map((f) => (
            <NavItem
              key={f.id}
              to="/mail/$folder"
              folder={f.id}
              onHover={() => prefetchFolder(user.$id, makeView(f.id))}
              label={f.label}
              icon={f.icon}
              count={f.count ? counts[f.count] : undefined}
              active={params.folder === f.id}
              onMenu={(e) =>
                openContextMenu(e, [
                  { heading: f.label },
                  { label: 'Open', icon: <f.icon />, onSelect: () => navigate({ to: '/mail/$folder', params: { folder: f.id } }) },
                  ['inbox', 'archive', 'spam', 'all'].includes(f.id) && {
                    label: 'Mark All as Read',
                    icon: <MailOpen />,
                    onSelect: () => (f.id === 'all' ? ['inbox', 'archive'] : [f.id]).forEach((id) => markFolderRead(user.$id, id)),
                  },
                  (f.id === 'trash' || f.id === 'spam') && { separator: true },
                  (f.id === 'trash' || f.id === 'spam') && { label: 'Empty Trash and Junk', icon: <Trash2 />, danger: true, onSelect: () => emptyTrash() },
                ])
              }
              onDropIds={['inbox', 'archive', 'spam', 'trash'].includes(f.id) ? move(f.id) : f.id === 'starred' ? (ids) => updateMessages(ids, { starred: true }) : undefined}
            />
          ))}
        </div>

        <button
          onClick={() => setLabelsOpen((v) => !v)}
          className="eyebrow no-mark group mb-1.5 mt-6 flex w-full items-center gap-1 px-2 text-[11.5px] text-fg-3"
        >
          Labels
          <ChevronDown className={cx('h-3 w-3 transition-transform', !labelsOpen && '-rotate-90')} />
          <span className="flex-1" />
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setLabelsOpen(true);
              setNewLabel('');
            }}
            className="rounded p-0.5 opacity-0 transition hover:bg-fill group-hover:opacity-100"
            aria-label="New label"
          >
            <Plus className="h-3.5 w-3.5" />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {labelsOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-px overflow-hidden">
              {labels.map((l) => (
                <NavItem
                  key={l.$id}
                  to="/mail/$folder"
                  folder="label"
                  onHover={() => prefetchFolder(user.$id, makeView('label', { label: l.$id }))}
                  search={{ label: l.$id }}
                  label={l.name}
                  color={l.color}
                  active={params.folder === 'label' && search.label === l.$id}
                  onMenu={(e) =>
                    openContextMenu(e, [
                      { heading: l.name },
                      {
                        label: 'Open',
                        icon: <TagIcon />,
                        onSelect: () => navigate({ to: '/mail/$folder', params: { folder: 'label' }, search: { label: l.$id } as never }),
                      },
                      {
                        label: 'Color',
                        icon: <Palette />,
                        submenu: LABEL_COLORS.map((c) => ({
                          label: LABEL_COLOR_NAMES[c] || c,
                          icon: <span className="block h-2.5 w-2.5 rounded-full" style={{ background: c }} />,
                          checked: l.color === c,
                          onSelect: async () => {
                            await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.labels, rowId: l.$id, data: { color: c } });
                            queryClient.invalidateQueries({ queryKey: ['labels'] });
                          },
                        })),
                      },
                      { separator: true },
                      {
                        label: 'Delete Label',
                        icon: <Trash2 />,
                        danger: true,
                        onSelect: async () => {
                          await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.labels, rowId: l.$id });
                          queryClient.invalidateQueries({ queryKey: ['labels'] });
                          toast({ title: `Deleted label ${l.name}`, tone: 'success' });
                        },
                      },
                    ])
                  }
                  onDropIds={(ids) => {
                    ids.forEach((id) => {
                      const current = findCachedRow(id)?.labels || [];
                      if (!current.includes(l.$id)) updateMessages([id], { labels: [...current, l.$id] });
                    });
                    toast({ title: `Labelled ${ids.length} as ${l.name}`, tone: 'success' });
                  }}
                />
              ))}
              {newLabel !== null ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (newLabel.trim()) await createLabel(user.$id, newLabel.trim(), LABEL_COLORS[labels.length % LABEL_COLORS.length]);
                    setNewLabel(null);
                  }}
                  className="px-1"
                >
                  <input
                    autoFocus
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onBlur={() => setNewLabel(null)}
                    onKeyDown={(e) => e.key === 'Escape' && setNewLabel(null)}
                    placeholder="Label name"
                    maxLength={64}
                    className="h-8 w-full rounded-md border border-line-strong bg-transparent px-2 text-[13px] outline-none focus:border-fg-3"
                  />
                </form>
              ) : (
                labelsQuery.isSuccess &&
                !labels.length && (
                  <button onClick={() => setNewLabel('')} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-3 hover:bg-fill hover:text-fg-2">
                    <Plus className="h-4 w-4" /> New label
                  </button>
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="eyebrow no-mark mb-1.5 mt-6 px-2 text-[11.5px] text-fg-3">More</div>
        <div className="space-y-px">
          <NavItem to="/mail/contacts" label="Contacts" icon={Users} active={pathname.startsWith('/mail/contacts')} />
          <NavItem to="/mail/settings" label="Settings" icon={Settings} active={pathname.startsWith('/mail/settings')} />
        </div>
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <button
          ref={accountRef}
          onClick={() => setAccountMenu((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition hover:bg-fill"
        >
          <Avatar name={user.name || mailbox.handle} email={mailbox.address} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{user.name || mailbox.handle}</div>
            <div className="truncate text-[11px] text-fg-3">{mailbox.handle}@inbox-…</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-fg-3" />
        </button>
        <Popover open={accountMenu} onClose={() => setAccountMenu(false)} anchor={accountRef.current} placement="top-start" width={260}>
          <div className="px-2 pb-2 pt-1">
            <div className="text-[13px] font-semibold">{user.name}</div>
            <div className="mt-0.5 break-all text-[11.5px] leading-snug text-fg-2">{mailbox.address}</div>
          </div>
          <MenuItem
            icon={<Copy />}
            onClick={() => {
              navigator.clipboard.writeText(mailbox.address);
              toast({ title: 'Address copied', tone: 'success' });
              setAccountMenu(false);
            }}
          >
            Copy address
          </MenuItem>
          <MenuSeparator />
          {(
            [
              ['system', 'Match system', Monitor],
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ] as const
          ).map(([value, label, Icon]) => (
            <MenuItem key={value} icon={<Icon />} onClick={() => updatePrefs({ theme: value })} shortcut={theme === value ? '✓' : undefined}>
              {label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<Settings />}
            onClick={() => {
              setAccountMenu(false);
              navigate({ to: '/mail/settings' });
            }}
          >
            Settings
          </MenuItem>
          <MenuItem
            icon={<LogOut />}
            onClick={async () => {
              await signOut();
              navigate({ to: '/login' });
            }}
          >
            Sign out
          </MenuItem>
        </Popover>
      </div>
    </div>
  );

  return (
    <>
      <aside className="relative hidden w-[248px] shrink-0 border-r border-line bg-sidebar md:block">{content}</aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[var(--scrim)] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => uiStore.set({ sidebarOpen: false })}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[284px] border-r border-line bg-sidebar md:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

