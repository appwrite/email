import DOMPurify from 'dompurify';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Ban,
  CalendarClock,
  ChevronDown,
  Clock,
  Forward,
  FolderInput,
  Inbox,
  Mail,
  MoreHorizontal,
  Printer,
  Reply,
  ReplyAll,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { callApi } from '~/lib/api';
import {
  DATABASE_ID,
  TABLES,
  isOwnAddress,
  parseAttachments,
  tablesDB,
  type DraftRow,
  type MessageRow,
} from '~/lib/appwrite';
import {
  archive,
  forward,
  moveTo,
  reply,
  setRead,
  snooze,
  snoozePresets,
  spam,
  toggleLabel,
  toggleStar,
  trash,
} from '~/lib/actions';
import { FOLDERS, LABEL_COLORS } from '~/lib/folders';
import { displayName, escapeHtml, fullDate, listDate, parseAddress, shortDateTime } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { createLabel, deleteMessagesForever, findCachedRow, queryClient, useLabels, useSettings, useThread } from '~/lib/queries';
import { GateProvider, HoldWhile, useHold, useReadyGate } from '~/lib/ready-gate';
import { openComposer, toast } from '~/lib/store';
import { Attachments } from './Attachments';
import { EmailFrame } from './EmailFrame';
import { Avatar, Button, Empty, IconButton, MenuItem, MenuLabel, MenuSeparator, Popover, Spinner, cx } from './ui';

export type ReaderMenus = { snooze: () => void };

export function Reader({
  messageId,
  onClose,
  menusRef,
}: {
  messageId?: string;
  onClose: () => void;
  menusRef?: React.MutableRefObject<ReaderMenus | null>;
}) {
  const { user, mailbox } = useMail();
  const cached = messageId ? findCachedRow(messageId) : undefined;
  const [threadId, setThreadId] = useState(cached?.threadId);

  useEffect(() => {
    if (!messageId) return setThreadId(undefined);
    const row = findCachedRow(messageId);
    if (row) return setThreadId(row.threadId);
    tablesDB
      .getRow<MessageRow>({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: messageId })
      .then((r) => setThreadId(r.threadId))
      .catch(() => setThreadId(undefined));
  }, [messageId]);

  const thread = useThread(user.$id, threadId);
  const settings = useSettings(user.$id).data;
  const labels = useLabels(user.$id).data || [];
  const current = thread.data?.find((r) => r.$id === messageId) || cached;

  const visible = useMemo(() => {
    // Until the thread arrives, show the row we already have from the list.
    const rows = thread.data || (cached && cached.threadId === threadId ? [cached] : []);
    // Hide trashed/junk copies unless that is what the user opened.
    return rows.filter((r) => r.$id === messageId || !['trash', 'spam'].includes(r.folder) || ['trash', 'spam'].includes(current?.folder || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.data, messageId, current?.folder, threadId]);

  // Opening a conversation marks it read.
  useEffect(() => {
    const unread = visible.filter((r) => !r.read).map((r) => r.$id);
    if (unread.length) setRead(unread, true);
  }, [visible]);

  // Expanded messages are decided once when the thread arrives (opened one,
  // unread ones, the latest) so marking them read never collapses anything.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(messageId ? [messageId] : []));
  const seeded = useRef(false);
  useLayoutEffect(() => {
    if (seeded.current || !thread.data?.length) return;
    seeded.current = true;
    const rows = thread.data;
    setExpanded((s) => new Set([...s, ...rows.filter((r) => !r.read).map((r) => r.$id), rows[rows.length - 1].$id]));
  }, [thread.data]);

  const { gate, ready } = useReadyGate();

  const snoozeRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<null | 'snooze' | 'move' | 'label' | 'more'>(null);
  const [customSnooze, setCustomSnooze] = useState('');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (menusRef) menusRef.current = { snooze: () => setMenu('snooze') };
  }, [menusRef]);

  if (!messageId) {
    return (
      <Empty icon={<Mail />} title="No message selected">
        Select a message to read it here. Press <b>C</b> to write a new one.
      </Empty>
    );
  }

  if (!current || !visible.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="appear-late text-fg-3" />
      </div>
    );
  }

  const ids = visible.map((r) => r.$id);
  const actionIds = ids.length ? ids : [current.$id];
  const last = [...visible].reverse().find((r) => r.folder !== 'sent' && r.folder !== 'scheduled') || visible[visible.length - 1] || current;
  const starred = visible.some((r) => r.starred);
  const threadLabels = [...new Set(visible.flatMap((r) => r.labels || []))].map((id) => labels.find((l) => l.$id === id)).filter(Boolean);
  const folder = current.folder;
  const close = () => {
    setMenu(null);
    onClose();
  };

  const blockSender = async () => {
    const email = current.fromEmail.toLowerCase();
    const list = [...new Set([...(settings?.blockedSenders || []), email])];
    await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.settings, rowId: user.$id, data: { blockedSenders: list } });
    queryClient.invalidateQueries({ queryKey: ['settings'] });
    await trash([current.$id]);
    toast({ title: `Blocked ${email}`, description: 'Future mail goes straight to Trash.', tone: 'success' });
    close();
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="z-10 flex h-[52px] shrink-0 items-center gap-0.5 border-b border-line bg-chrome px-2 no-print">
        <IconButton label="Back" onClick={close} className="lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        {folder === 'trash' ? (
          <>
            <IconButton label="Restore to Inbox" onClick={() => moveTo(actionIds, 'inbox')}>
              <RotateCcw className="h-[18px] w-[18px]" />
            </IconButton>
            <IconButton
              label="Delete forever"
              onClick={() => {
                deleteMessagesForever(actionIds);
                close();
              }}
            >
              <Trash2 className="h-[18px] w-[18px] text-danger" />
            </IconButton>
          </>
        ) : (
          <>
            {folder !== 'archive' && (
              <IconButton
                label="Archive (E)"
                onClick={() => {
                  archive(actionIds);
                  close();
                }}
              >
                <Archive className="h-[18px] w-[18px]" />
              </IconButton>
            )}
            <IconButton
              label="Delete (#)"
              onClick={() => {
                trash(actionIds);
                close();
              }}
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </IconButton>
            <IconButton
              className="max-sm:hidden"
              label={folder === 'spam' ? 'Not junk' : 'Junk (!)'}
              onClick={() => {
                spam(actionIds, folder !== 'spam');
                close();
              }}
            >
              {folder === 'spam' ? <ShieldCheck className="h-[18px] w-[18px]" /> : <ShieldAlert className="h-[18px] w-[18px]" />}
            </IconButton>
          </>
        )}
        <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <IconButton ref={moveRef} label="Move to" onClick={() => setMenu('move')}>
          <FolderInput className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton ref={labelRef} label="Labels" onClick={() => setMenu('label')}>
          <Tag className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton ref={snoozeRef} label="Snooze (B)" onClick={() => setMenu('snooze')}>
          <Clock className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label={starred ? 'Unstar (S)' : 'Star (S)'} onClick={() => toggleStar(actionIds)}>
          <Star className={cx('h-[18px] w-[18px]', starred && 'fill-accent text-accent')} />
        </IconButton>
        <div className="flex-1" />
        <IconButton label="Reply (R)" onClick={() => reply(last, mailbox, false, settings?.signature)}>
          <Reply className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton className="max-sm:hidden" label="Reply all (A)" onClick={() => reply(last, mailbox, true, settings?.signature)}>
          <ReplyAll className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton className="max-sm:hidden" label="Forward (F)" onClick={() => forward(last, settings?.signature)}>
          <Forward className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton ref={moreRef} label="More" onClick={() => setMenu('more')}>
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </IconButton>

        <Popover open={menu === 'move'} onClose={() => setMenu(null)} anchor={moveRef.current} width={200}>
          <MenuLabel>Move to</MenuLabel>
          {FOLDERS.filter((f) => ['inbox', 'archive', 'spam', 'trash'].includes(f.id) && f.id !== folder).map((f) => (
            <MenuItem
              key={f.id}
              icon={<f.icon />}
              onClick={() => {
                moveTo(actionIds, f.id);
                close();
              }}
            >
              {f.label}
            </MenuItem>
          ))}
        </Popover>

        <Popover open={menu === 'label'} onClose={() => setMenu(null)} anchor={labelRef.current} width={230}>
          <MenuLabel>Labels</MenuLabel>
          {labels.map((l) => {
            const on = visible.every((r) => (r.labels || []).includes(l.$id));
            return (
              <MenuItem key={l.$id} onClick={() => toggleLabel(actionIds, l.$id)} icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />} shortcut={on ? '✓' : undefined}>
                {l.name}
              </MenuItem>
            );
          })}
          {labels.length > 0 && <MenuSeparator />}
          <form
            className="p-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newLabel.trim()) return;
              const label = await createLabel(user.$id, newLabel.trim(), LABEL_COLORS[labels.length % LABEL_COLORS.length]);
              await toggleLabel(actionIds, label.$id);
              setNewLabel('');
            }}
          >
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New label…"
              className="h-8 w-full rounded-md border border-line bg-transparent px-2 text-[13px] outline-none placeholder:text-fg-3 focus:border-fg-3 dark:border-line-strong"
            />
          </form>
        </Popover>

        <Popover open={menu === 'snooze'} onClose={() => setMenu(null)} anchor={snoozeRef.current} width={250}>
          <MenuLabel>Snooze until…</MenuLabel>
          {snoozePresets().map((p) => (
            <MenuItem
              key={p.label}
              icon={<Clock />}
              shortcut={p.hint}
              onClick={() => {
                snooze(actionIds, p.date);
                close();
              }}
            >
              {p.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <form
            className="flex gap-1 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new Date(customSnooze);
              if (Number.isNaN(d.getTime()) || d < new Date()) return toast({ title: 'Pick a time in the future', tone: 'error' });
              snooze(actionIds, d);
              close();
            }}
          >
            <input
              type="datetime-local"
              value={customSnooze}
              onChange={(e) => setCustomSnooze(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 text-[12.5px] outline-none focus:border-fg-3 dark:border-line-strong"
            />
            <Button size="sm" variant="primary" type="submit">
              Set
            </Button>
          </form>
        </Popover>

        <Popover open={menu === 'more'} onClose={() => setMenu(null)} anchor={moreRef.current} placement="bottom-end" width={220}>
          <MenuItem
            icon={<Mail />}
            onClick={() => {
              setRead([current.$id], false);
              close();
            }}
          >
            Mark as unread
          </MenuItem>
          {folder !== 'inbox' && folder !== 'sent' && (
            <MenuItem
              icon={<Inbox />}
              onClick={() => {
                moveTo(actionIds, 'inbox');
                close();
              }}
            >
              Move to Inbox
            </MenuItem>
          )}
          <div className="sm:hidden">
            <MenuItem
              icon={folder === 'spam' ? <ShieldCheck /> : <ShieldAlert />}
              onClick={() => {
                spam(actionIds, folder !== 'spam');
                close();
              }}
            >
              {folder === 'spam' ? 'Not junk' : 'Mark as junk'}
            </MenuItem>
          </div>
          <MenuItem
            icon={<Printer />}
            onClick={() => {
              setMenu(null);
              printThread(visible);
            }}
          >
            Print
          </MenuItem>
          {current.fromEmail !== mailbox.address && (
            <>
              <MenuSeparator />
              <MenuItem icon={<Ban />} danger onClick={blockSender}>
                Block {displayName({ name: current.fromName, email: current.fromEmail })}
              </MenuItem>
            </>
          )}
        </Popover>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <GateProvider gate={gate}>
        <HoldWhile active={!thread.data} />
        <div
          className={cx('mx-auto max-w-[860px] px-5 pb-28 pt-6 sm:px-8', ready ? 'opacity-100 transition-opacity duration-100' : 'pointer-events-none opacity-0')}
          aria-busy={!ready}
        >
          <h1 className="text-balance font-display font-bold text-[26px] leading-tight tracking-[-0.015em]">{current.subject || '(no subject)'}</h1>
          {(threadLabels.length > 0 || visible.length > 1) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {visible.length > 1 && <span className="text-[11.5px] text-fg-3">{visible.length} messages</span>}
              {threadLabels.map((l) => (
                <button
                  key={l!.$id}
                  onClick={() => toggleLabel(actionIds, l!.$id)}
                  title="Remove label"
                  className="inline-flex h-5 items-center rounded-md px-2 text-[11.5px] font-medium"
                  style={{ background: `${l!.color}1f`, color: l!.color }}
                >
                  {l!.name}
                </button>
              ))}
            </div>
          )}

          <StatusBanner row={current} />

          <div className="mt-5 space-y-3">
            {visible.map((row, i) => (
              <MessageCard
                key={row.$id}
                row={row}
                expanded={expanded.has(row.$id) || i === visible.length - 1}
                inThread={visible.length > 1}
                onToggle={() =>
                  setExpanded((s) => {
                    const n = new Set(s);
                    if (n.has(row.$id)) n.delete(row.$id);
                    else n.add(row.$id);
                    return n;
                  })
                }
                onReply={(all) => reply(row, mailbox, all, settings?.signature)}
                onForward={() => forward(row, settings?.signature)}
                self={mailbox.address}
              />
            ))}
          </div>

          {folder !== 'scheduled' && (
            <div className="mt-6 flex flex-wrap gap-2 no-print">
              <Button onClick={() => reply(last, mailbox, false, settings?.signature)}>
                <Reply className="h-4 w-4" /> Reply
              </Button>
              {(last.to?.length || 0) + (last.cc?.length || 0) > 1 && (
                <Button onClick={() => reply(last, mailbox, true, settings?.signature)}>
                  <ReplyAll className="h-4 w-4" /> Reply All
                </Button>
              )}
              <Button onClick={() => forward(last, settings?.signature)}>
                <Forward className="h-4 w-4" /> Forward
              </Button>
            </div>
          )}
        </div>
        </GateProvider>
      </div>
    </div>
  );
}

function StatusBanner({ row }: { row: MessageRow }) {
  const [busy, setBusy] = useState(false);
  const spamBanner =
    row.folder === 'spam' && row.spamReason ? (
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-[rgba(245,158,11,0.1)] px-4 py-3 text-[13px]">
        <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
        <div className="flex-1">
          Moved to Junk by the spam filter <span className="text-[12px] text-fg-2">({row.spamReason})</span>
        </div>
        <Button size="sm" onClick={() => spam([row.$id], false)}>
          Not junk
        </Button>
      </div>
    ) : null;
  if (spamBanner) return spamBanner;
  // The gateway was unsure: the message stays in the Inbox, flagged.
  if (row.folder !== 'spam' && row.spamReason?.startsWith('unsure')) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-[rgba(245,158,11,0.1)] px-4 py-3 text-[13px]">
        <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
        <div className="flex-1">
          This message might be spam <span className="text-[12px] text-fg-2">({row.spamReason})</span>
        </div>
        <Button size="sm" onClick={() => spam([row.$id], true)}>
          Move to Junk
        </Button>
      </div>
    );
  }
  useEffect(() => {
    if (row.status !== 'sending') return;
    const t = setTimeout(() => callApi('POST', '/status').catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, [row.status, row.$id]);

  if (row.folder === 'scheduled' && row.scheduledAt) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-3 text-[13px]">
        <CalendarClock className="h-5 w-5 shrink-0 text-accent" />
        <div className="flex-1">
          Scheduled to send <b>{shortDateTime(row.scheduledAt)}</b>
        </div>
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { draft } = await callApi<{ draft: DraftRow }>('POST', '/scheduled/cancel', { id: row.$id });
              openComposer({
                mode: 'draft',
                draftId: draft.$id,
                to: draft.to,
                cc: draft.cc,
                bcc: draft.bcc,
                showCc: draft.cc.length + draft.bcc.length > 0,
                subject: draft.subject,
                html: draft.html,
                attachments: parseAttachments(draft.attachments),
                inReplyTo: draft.inReplyTo,
                refs: (draft.refs || '').split(/\s+/).filter(Boolean),
                threadId: draft.threadId,
              });
              toast({ title: 'Send cancelled', description: 'The message is back in Drafts.', tone: 'success' });
            } catch (e: any) {
              toast({ title: 'Could not cancel', description: e.message, tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Cancel & edit
        </Button>
      </div>
    );
  }
  if (row.status === 'failed') {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-[13px]">
        <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
        <div className="flex-1">This message could not be delivered to external recipients. Check the Messaging provider and try again.</div>
        <Button
          size="sm"
          onClick={() =>
            openComposer({
              to: row.to,
              cc: row.cc,
              bcc: row.bcc,
              showCc: (row.cc?.length || 0) > 0,
              subject: row.subject,
              html: row.html || '',
              attachments: parseAttachments(row.attachments),
              threadId: row.threadId,
            })
          }
        >
          Edit & resend
        </Button>
      </div>
    );
  }
  if (row.status === 'sending') {
    return (
      <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-2">
        <Spinner size={14} /> Sending…
      </div>
    );
  }
  return null;
}

function MessageCard({
  row,
  expanded,
  inThread,
  onToggle,
  onReply,
  onForward,
  self,
}: {
  row: MessageRow;
  expanded: boolean;
  inThread: boolean;
  onToggle: () => void;
  onReply: (all: boolean) => void;
  onForward: () => void;
  self: string;
}) {
  const [details, setDetails] = useState(false);
  const attachments = parseAttachments(row.attachments).filter((a) => !a.inline);
  const name = displayName({ name: row.fromName, email: row.fromEmail });
  const recipients = [...(row.to || []), ...(row.cc || [])].map((v) => {
    const a = parseAddress(v);
    return isOwnAddress(a.email, self.split('@')[0]) ? 'me' : displayName(a);
  });

  return (
    <article
      className={cx('@container rounded-xl border border-line bg-card transition-colors dark:border-line-strong/60', !expanded && 'hover:bg-fill')}
    >
      <div className={cx('flex cursor-default gap-3 px-4', expanded ? 'pt-4' : 'py-3')} onClick={inThread ? onToggle : undefined}>
        <Avatar name={name} email={row.fromEmail} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 shrink-0 truncate text-[14px] font-semibold @max-lg:shrink">{name}</span>
            {expanded && <span className="hidden min-w-0 truncate text-[11.5px] text-fg-3 @lg:inline">{row.fromEmail}</span>}
            <span className="ml-auto shrink-0 text-[12px] text-fg-3" title={fullDate(row.date)}>
              {expanded ? shortDateTime(row.date) : listDate(row.date)}
            </span>
          </div>
          {expanded ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDetails((v) => !v);
              }}
              className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[12.5px] text-fg-2"
            >
              <span className="truncate">to {recipients.join(', ') || '—'}</span>
              <ChevronDown className={cx('h-3 w-3 shrink-0 transition-transform', details && 'rotate-180')} />
            </button>
          ) : (
            <div className="truncate text-[13px] text-fg-2">{row.snippet}</div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && details && (
          <motion.dl
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-4 mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 overflow-hidden rounded-lg border border-line bg-sunken px-3 py-2 text-[12px] dark:border-line-strong/60"
          >
            <dt className="text-[12px] text-fg-3 leading-[18px]">From</dt>
            <dd className="break-all">{row.fromName ? `${row.fromName} <${row.fromEmail}>` : row.fromEmail}</dd>
            {row.to?.length > 0 && (
              <>
                <dt className="text-[12px] text-fg-3 leading-[18px]">To</dt>
                <dd className="break-all">{row.to.join(', ')}</dd>
              </>
            )}
            {row.cc?.length > 0 && (
              <>
                <dt className="text-[12px] text-fg-3 leading-[18px]">Cc</dt>
                <dd className="break-all">{row.cc.join(', ')}</dd>
              </>
            )}
            {row.bcc?.length > 0 && (
              <>
                <dt className="text-[12px] text-fg-3 leading-[18px]">Bcc</dt>
                <dd className="break-all">{row.bcc.join(', ')}</dd>
              </>
            )}
            {row.replyTo && (
              <>
                <dt className="text-[12px] text-fg-3 leading-[18px]">Reply-To</dt>
                <dd className="break-all">{row.replyTo}</dd>
              </>
            )}
            <dt className="text-[12px] text-fg-3 leading-[18px]">Date</dt>
            <dd>{fullDate(row.date)}</dd>
          </motion.dl>
        )}
      </AnimatePresence>
      {expanded && (
        <div className="px-4 pb-4 pt-4">
          <FullBody row={row} collapseQuotes={inThread} />
          <Attachments items={attachments} />
          {inThread && (
            <div className="mt-3 flex gap-1 no-print">
              <IconButton size="sm" label="Reply" onClick={() => onReply(false)}>
                <Reply className="h-4 w-4" />
              </IconButton>
              <IconButton size="sm" label="Reply all" onClick={() => onReply(true)}>
                <ReplyAll className="h-4 w-4" />
              </IconButton>
              <IconButton size="sm" label="Forward" onClick={onForward}>
                <Forward className="h-4 w-4" />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// List rows omit the body; fetch it when a cached row has none.
function FullBody({ row, collapseQuotes }: { row: MessageRow; collapseQuotes: boolean }) {
  const hasBody = row.html !== undefined || row.text !== undefined;
  const [full, setFull] = useState<MessageRow | null>(hasBody ? row : null);
  useHold(!full);
  useEffect(() => {
    if (row.html !== undefined || row.text !== undefined) return setFull(row);
    tablesDB.getRow<MessageRow>({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: row.$id }).then(setFull);
  }, [row]);
  if (!full) return <div className="h-20" />;
  return <EmailFrame html={full.html} text={full.text} collapseQuotes={collapseQuotes} cacheKey={`${row.$id}:${collapseQuotes ? 'q' : ''}`} />;
}

function printThread(rows: MessageRow[]) {
  const w = window.open('', '_blank', 'noopener=false,width=900,height=700');
  if (!w) return;
  const parts = rows
    .map(
      (r) => `<section style="page-break-inside:avoid;margin-bottom:32px">
      <div style="font:600 15px -apple-system,system-ui">${escapeHtml(r.fromName || r.fromEmail)} &lt;${escapeHtml(r.fromEmail)}&gt;</div>
      <div style="font:13px -apple-system,system-ui;color:#6e6e73;margin:2px 0 14px">${escapeHtml(fullDate(r.date))} · to ${escapeHtml((r.to || []).join(', '))}</div>
      <div>${r.html ? DOMPurify.sanitize(r.html, { FORBID_TAGS: ['style', 'script', 'iframe', 'form'] }) : `<pre style="white-space:pre-wrap;font:14px -apple-system,system-ui">${escapeHtml(r.text || '')}</pre>`}</div></section>`,
    )
    .join('<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">');
  w.document.write(
    `<!doctype html><title>${escapeHtml(rows[0]?.subject || 'Message')}</title><body style="max-width:760px;margin:40px auto;padding:0 24px;font-family:-apple-system,system-ui"><h1 style="font-size:24px">${escapeHtml(rows[0]?.subject || '')}</h1>${parts}<script>onload=()=>{print()}</script></body>`,
  );
  w.document.close();
}
