import DOMPurify from 'dompurify';
import { ID, Permission, Role } from 'appwrite';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bold,
  CalendarClock,
  ChevronDown,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  PenSquare,
  Quote,
  RemoveFormatting,
  Send,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { callApi } from '~/lib/api';
import { BUCKET_ID, DATABASE_ID, TABLES, storage, tablesDB } from '~/lib/appwrite';
import { snoozePresets } from '~/lib/actions';
import { bytes, displayName, formatAddress, isEmail, parseAddress, shortDateTime } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { ownerPerms, queryClient, useContacts } from '~/lib/queries';
import {
  closeComposer,
  dismissToast,
  openComposer,
  toast,
  uiStore,
  updateComposer,
  type ComposerState,
  type UploadingAttachment,
} from '~/lib/store';
import { AttachmentIcon } from './Attachments';
import { Avatar, Button, IconButton, MenuItem, MenuLabel, MenuSeparator, Popover, cx } from './ui';

const UNDO_MS = 5000;

export function ComposerDock() {
  const composers = uiStore.use((s) => s.composers);
  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[60] flex items-end gap-3 px-3 sm:px-5 sm:pb-4 no-print">
      <AnimatePresence>
        {composers.map((c) => (
          <ComposerWindow key={c.key} state={c} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function titleFor(state: ComposerState) {
  if (state.subject.trim()) return state.subject;
  return { new: 'New Message', reply: 'Reply', replyAll: 'Reply All', forward: 'Forward', draft: 'Draft' }[state.mode];
}

function ComposerWindow({ state }: { state: ComposerState }) {
  const { user, mailbox } = useMail();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const laterRef = useRef<HTMLButtonElement>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [customLater, setCustomLater] = useState('');
  const [toolbar, setToolbar] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  const update = useCallback(
    (patch: Partial<ComposerState>) => {
      dirty.current = true;
      updateComposer(state.key, patch);
    },
    [state.key],
  );

  // Initialise the editor once; afterwards it is uncontrolled for smooth typing.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = state.html;
    if (state.focus === 'body' || (state.mode !== 'new' && state.mode !== 'forward' && state.to.length)) {
      el.focus();
      const range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave to the drafts table.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      const s = latest.current;
      const hasContent = s.to.length || s.subject.trim() || (editorRef.current?.innerText.trim() || '').length > 0;
      if (!hasContent) return;
      setSaved('saving');
      const data = {
        ownerId: user.$id,
        to: s.to,
        cc: s.cc,
        bcc: s.bcc,
        subject: s.subject,
        html: editorRef.current?.innerHTML || s.html,
        attachments: JSON.stringify(s.attachments.filter((a) => !a.uploading && !a.error).map(({ progress, uploading, error, ...a }) => a)),
        inReplyTo: s.inReplyTo || '',
        refs: (s.refs || []).join(' '),
        threadId: s.threadId || '',
      };
      try {
        if (s.draftId) {
          await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.drafts, rowId: s.draftId, data });
        } else {
          const row = await tablesDB.createRow({ databaseId: DATABASE_ID, tableId: TABLES.drafts, rowId: ID.unique(), data, permissions: ownerPerms(user.$id) });
          updateComposer(s.key, { draftId: row.$id });
        }
        dirty.current = false;
        setSaved('saved');
      } catch {
        setSaved('idle');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [state.to, state.cc, state.bcc, state.subject, state.html, state.attachments, user.$id]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          toast({ title: `${file.name} is larger than 25 MB`, tone: 'error' });
          continue;
        }
        const id = ID.unique();
        const pending: UploadingAttachment = { id, name: file.name, size: file.size, type: file.type || 'application/octet-stream', uploading: true, progress: 0 };
        updateComposer(state.key, { attachments: [...latest.current.attachments, pending] });
        const patch = (p: Partial<UploadingAttachment>) =>
          updateComposer(state.key, { attachments: latest.current.attachments.map((a) => (a.id === id ? { ...a, ...p } : a)) });
        try {
          await storage.createFile({
            bucketId: BUCKET_ID,
            fileId: id,
            file,
            permissions: [Permission.read(Role.user(user.$id)), Permission.delete(Role.user(user.$id))],
            onProgress: (p) => patch({ progress: p.progress }),
          });
          patch({ uploading: false, progress: 100 });
          dirty.current = true;
        } catch (e: any) {
          patch({ uploading: false, error: e.message });
          toast({ title: `Could not upload ${file.name}`, description: e.message, tone: 'error' });
        }
      }
    },
    [state.key, user.$id],
  );

  const syncHtml = () => update({ html: editorRef.current?.innerHTML || '' });

  async function discard() {
    closeComposer(state.key);
    if (state.draftId) {
      await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.drafts, rowId: state.draftId }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
    }
  }

  function payload(scheduledAt?: Date) {
    const s = latest.current;
    return {
      to: s.to,
      cc: s.cc,
      bcc: s.bcc,
      subject: s.subject,
      html: editorRef.current?.innerHTML || s.html,
      attachments: s.attachments.filter((a) => !a.error).map((a) => a.id),
      inReplyTo: s.inReplyTo,
      refs: s.refs,
      threadId: s.threadId,
      draftId: s.draftId,
      scheduledAt: scheduledAt?.toISOString(),
    };
  }

  function validate() {
    const s = latest.current;
    if (!s.to.length && !s.cc.length && !s.bcc.length) {
      toast({ title: 'Add at least one recipient', tone: 'error' });
      return false;
    }
    const bad = [...s.to, ...s.cc, ...s.bcc].find((r) => !isEmail(parseAddress(r).email));
    if (bad) {
      toast({ title: `“${bad}” is not a valid address`, tone: 'error' });
      return false;
    }
    if (s.attachments.some((a) => a.uploading)) {
      toast({ title: 'Wait for attachments to finish uploading', tone: 'error' });
      return false;
    }
    return true;
  }

  function send(scheduledAt?: Date) {
    if (!validate()) return;
    const body = payload(scheduledAt);
    const snapshot = { ...latest.current, html: body.html, minimized: false };
    closeComposer(state.key);

    if (scheduledAt) {
      callApi('POST', '/send', body)
        .then(() => toast({ title: 'Scheduled', description: shortDateTime(scheduledAt.toISOString()), tone: 'success' }))
        .catch((e) => {
          openComposer(snapshot);
          toast({ title: 'Could not schedule', description: e.message, tone: 'error' });
        });
      return;
    }

    let cancelled = false;
    const toastId = toast({
      title: 'Sending…',
      tone: 'progress',
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelled = true;
          openComposer(snapshot);
        },
      },
    });
    setTimeout(async () => {
      if (cancelled) return;
      dismissToast(toastId);
      try {
        const res = await callApi<{ status: string; error?: string }>('POST', '/send', body);
        if (res.status === 'failed') {
          toast({ title: 'Saved to Sent, but delivery failed', description: res.error || 'Check the Messaging provider.', tone: 'error' });
        } else {
          toast({ title: 'Message sent', tone: 'success' });
        }
        queryClient.invalidateQueries({ queryKey: ['drafts'] });
      } catch (e: any) {
        openComposer(snapshot);
        toast({ title: 'Message not sent', description: e.message, tone: 'error' });
      }
    }, UNDO_MS);
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && !laterOpen) {
      e.preventDefault();
      updateComposer(state.key, { minimized: true });
    }
  };

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    syncHtml();
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      uploadFiles(files);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'script', 'meta', 'link', 'iframe', 'form'], FORBID_ATTR: ['class', 'id'] });
      document.execCommand('insertHTML', false, clean);
      syncHtml();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length) uploadFiles(files);
  };

  if (state.minimized) {
    return (
      <motion.button
        layout
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={() => updateComposer(state.key, { minimized: false })}
        className="vibrancy pointer-events-auto flex h-11 w-[260px] items-center gap-2.5 rounded-full bg-[color-mix(in_srgb,var(--elevated)_92%,transparent)] pl-4 pr-1.5 text-left shadow-pop ring-1 ring-line dark:ring-line-strong"
      >
        <PenSquare className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex-1 truncate text-[13.5px] font-semibold">{titleFor(state)}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            closeComposer(state.key);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-3 hover:bg-fill hover:text-fg"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </span>
      </motion.button>
    );
  }

  return (
    <motion.div
      layout
      initial={{ y: 60, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 60, opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', bounce: 0.12, duration: 0.42 }}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
      className={cx(
        // One position class per state: `relative` alongside `fixed` would win
        // and leave a full-screen composer stuck in the dock, cut off below.
        'pointer-events-auto flex flex-col overflow-hidden bg-elevated shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35),0_0_0_0.5px_var(--line-strong)]',
        state.maximized
          ? 'fixed inset-3 z-[70] rounded-[22px] sm:inset-x-[10vw] sm:inset-y-[6vh]'
          : 'fixed inset-0 z-[70] sm:relative sm:inset-auto sm:h-[min(640px,calc(100dvh-32px))] sm:w-[580px] sm:rounded-[22px]',
      )}
    >
      <div
        className="flex shrink-0 cursor-default items-start gap-2 pb-1 pl-5 pr-3 pt-4"
        onDoubleClick={() => updateComposer(state.key, { maximized: !state.maximized })}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[19px] font-bold leading-tight tracking-[-0.02em]">{titleFor(state)}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-fg-3">
            <span className="truncate">From {formatAddress({ name: user.name, email: mailbox.address })}</span>
            {saved !== 'idle' && <span className="shrink-0">· {saved === 'saving' ? 'Saving…' : 'Draft saved'}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {[
            { label: 'Minimize', icon: <Minus className="h-3.5 w-3.5" />, run: () => updateComposer(state.key, { minimized: true }), desktop: true },
            {
              label: state.maximized ? 'Exit full screen' : 'Full screen',
              icon: state.maximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />,
              run: () => updateComposer(state.key, { maximized: !state.maximized }),
              desktop: true,
            },
            { label: 'Close', icon: <X className="h-3.5 w-3.5" />, run: () => closeComposer(state.key) },
          ].map((b) => (
            <IconButton key={b.label} size="sm" label={b.label} onClick={b.run} className={cx('rounded-full bg-fill hover:bg-fill-2', b.desktop && 'max-sm:hidden')}>
              {b.icon}
            </IconButton>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-5">
        <RecipientField
          label="To"
          values={state.to}
          onChange={(to) => update({ to })}
          autoFocus={state.focus === 'to' || (state.mode === 'new' && !state.to.length)}
          trailing={
            !state.showCc && (
              <button onClick={() => updateComposer(state.key, { showCc: true })} className="rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-medium text-fg-2 hover:bg-fill-2 hover:text-fg">
                Cc Bcc
              </button>
            )
          }
        />
        {state.showCc && (
          <>
            <RecipientField label="Cc" values={state.cc} onChange={(cc) => update({ cc })} />
            <RecipientField label="Bcc" values={state.bcc} onChange={(bcc) => update({ bcc })} />
          </>
        )}
        <input
          value={state.subject}
          onChange={(e) => update({ subject: e.target.value })}
          placeholder="Subject"
          className="h-12 w-full bg-transparent text-[17px] font-semibold tracking-[-0.01em] outline-none placeholder:font-medium placeholder:text-fg-3"
        />
      </div>

      <AnimatePresence>
        {toolbar && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden px-4"
          >
            <div className="mb-1 inline-flex flex-wrap items-center gap-0.5 rounded-full bg-fill p-1">
              {[
                ['Bold', Bold, () => exec('bold')],
                ['Italic', Italic, () => exec('italic')],
                ['Underline', Underline, () => exec('underline')],
                ['Strikethrough', Strikethrough, () => exec('strikeThrough')],
                ['Bulleted list', List, () => exec('insertUnorderedList')],
                ['Numbered list', ListOrdered, () => exec('insertOrderedList')],
                ['Quote', Quote, () => exec('formatBlock', 'blockquote')],
                [
                  'Link',
                  Link2,
                  () => {
                    const url = prompt('Link URL');
                    if (url) exec('createLink', /^https?:|^mailto:/i.test(url) ? url : `https://${url}`);
                  },
                ],
                ['Clear formatting', RemoveFormatting, () => exec('removeFormat')],
              ].map(([label, Icon, run]: any) => (
                <IconButton key={label} size="sm" label={label} onMouseDown={(e) => e.preventDefault()} onClick={run} className="rounded-full hover:bg-fill-2">
                  <Icon className="h-4 w-4" />
                </IconButton>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="scroll-thin relative min-h-[120px] flex-1 overflow-y-auto px-5 pb-3 pt-2">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label="Message body"
          data-placeholder="Write your message…"
          onInput={syncHtml}
          onPaste={onPaste}
          className="editor min-h-full text-[15px] leading-[1.55]"
        />
        {state.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {state.attachments.map((a) => (
              <div key={a.id} className={cx('group relative flex h-12 max-w-[220px] items-center gap-2.5 rounded-2xl bg-fill pl-3 pr-8', a.error && 'ring-1 ring-danger')}>
                <AttachmentIcon a={a} className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">{a.name}</div>
                  <div className="text-[11px] text-fg-3">{a.error ? 'Failed' : a.uploading ? `${Math.round(a.progress || 0)}%` : bytes(a.size)}</div>
                </div>
                {a.uploading && (
                  <div className="absolute inset-x-3 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-fill-2">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${a.progress || 2}%` }} />
                  </div>
                )}
                <button
                  onClick={() => update({ attachments: state.attachments.filter((x) => x.id !== a.id) })}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-fg-3 hover:bg-fill hover:text-fg"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border border-dashed border-accent bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] text-[13px] font-medium text-fg"
            >
              Drop files to attach
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-1 px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-2">
        <IconButton label="Attach files" onClick={() => fileRef.current?.click()} className="rounded-full">
          <Paperclip className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Formatting" active={toolbar} onClick={() => setToolbar((v) => !v)} className="rounded-full">
          <Type className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Discard draft" onClick={discard} className="rounded-full">
          <Trash2 className="h-[18px] w-[18px]" />
        </IconButton>
        <div className="flex-1" />
        <span className="mr-2 hidden text-[11.5px] text-fg-3 sm:inline">⌘↵</span>
        {/* Send, with send-later in the same pill. */}
        <div className="flex h-9 overflow-hidden rounded-full bg-accent text-white shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--accent)_60%,transparent)]">
          <button onClick={() => send()} className="icon-hover flex items-center gap-2 pl-4 pr-3 text-[14px] font-semibold transition hover:brightness-110">
            Send
            <span className="icon-anim">
              <Send className="h-4 w-4" />
            </span>
          </button>
          <span className="my-2 w-px bg-white/30" aria-hidden />
          <button ref={laterRef} onClick={() => setLaterOpen(true)} aria-label="Send later" title="Send later" className="flex items-center px-2.5 transition hover:brightness-110">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <Popover open={laterOpen} onClose={() => setLaterOpen(false)} anchor={laterRef.current} placement="top-end" width={260}>
          <MenuLabel>Send later</MenuLabel>
          {[{ label: 'In 1 hour', date: new Date(Date.now() + 3600_000), hint: '' }, ...snoozePresets().filter((p) => p.label !== 'Later today')].map((p) => (
            <MenuItem
              key={p.label}
              icon={<CalendarClock />}
              shortcut={p.hint || undefined}
              onClick={() => {
                setLaterOpen(false);
                send(p.date);
              }}
            >
              {p.label === 'Tomorrow' ? 'Tomorrow morning' : p.label === 'Next week' ? 'Monday morning' : p.label === 'This weekend' ? 'Saturday morning' : p.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <form
            className="flex gap-1 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new Date(customLater);
              if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) {
                toast({ title: 'Pick a time at least a minute from now', tone: 'error' });
                return;
              }
              setLaterOpen(false);
              send(d);
            }}
          >
            <input type="datetime-local" value={customLater} onChange={(e) => setCustomLater(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 text-[12.5px] outline-none focus:border-fg-3 dark:border-line-strong" />
            <Button size="sm" variant="primary" type="submit">
              Schedule
            </Button>
          </form>
        </Popover>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            uploadFiles([...(e.target.files || [])]);
            e.target.value = '';
          }}
        />
      </div>
    </motion.div>
  );
}

function RecipientField({
  label,
  values,
  onChange,
  autoFocus,
  trailing,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  const { user } = useMail();
  const contacts = useContacts(user.$id).data || [];
  const [input, setInput] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(values.map((v) => parseAddress(v).email));
    return contacts
      .filter((c) => !taken.has(c.email) && (c.email.includes(q) || (c.name || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.timesContacted || 0) - (a.timesContacted || 0))
      .slice(0, 6);
  }, [input, contacts, values]);

  useEffect(() => setActive(0), [input]);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) {
      const a = parseAddress(p);
      if (!next.some((v) => parseAddress(v).email === a.email)) next.push(formatAddress(a));
    }
    onChange(next);
    setInput('');
  };

  const pick = (i: number) => {
    const c = suggestions[i];
    if (!c) return;
    onChange([...values, formatAddress({ name: c.name, email: c.email })]);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex min-h-11 items-center gap-2 border-b border-line/70 py-1.5" onClick={() => inputRef.current?.focus()}>
      <span className="w-8 shrink-0 self-start pt-[5px] text-[13px] text-fg-3">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {values.map((v) => {
          const a = parseAddress(v);
          const valid = isEmail(a.email);
          return (
            <span
              key={v}
              title={a.email}
              className={cx(
                'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full pl-0.5 pr-1 text-[13px]',
                valid ? 'bg-fill text-fg' : 'bg-[rgba(239,68,68,0.12)] text-danger',
              )}
            >
              <Avatar name={displayName(a)} email={valid ? a.email : undefined} size={24} />
              <span className="truncate font-medium">{displayName(a)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(values.filter((x) => x !== v));
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full text-fg-3 hover:bg-fill-2 hover:text-fg"
                aria-label={`Remove ${a.email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={input}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (input.trim()) commit(input);
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) commit(v);
            else setInput(v);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              commit(text);
            }
          }}
          onKeyDown={(e) => {
            if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              if (suggestions.length) {
                e.preventDefault();
                pick(active);
              } else if (input.trim()) {
                e.preventDefault();
                commit(input);
              }
            } else if (e.key === 'Backspace' && !input && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          className="h-7 min-w-[120px] flex-1 bg-transparent text-[14px] outline-none"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {trailing}
      <AnimatePresence>
        {focused && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-10 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-pop dark:border-line-strong"
          >
            {suggestions.map((c, i) => (
              <li
                key={c.$id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
                onMouseEnter={() => setActive(i)}
                className={cx('flex items-center gap-2.5 rounded-md px-2 py-1.5', i === active && 'bg-fill-2')}
              >
                <Avatar name={c.name || c.email} email={c.email} size={28} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">{c.name || displayName({ name: '', email: c.email })}</div>
                  <div className="truncate text-[11px] text-fg-3">{c.email}</div>
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
