import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Keyboard, LogOut, Monitor, Moon, PenSquare, Search, Settings, Sun, Tag, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { emptyTrash } from '~/lib/actions';
import { FOLDERS } from '~/lib/folders';
import { useMail } from '~/lib/mail-context';
import { useLabels } from '~/lib/queries';
import { signOut } from '~/lib/session';
import { openComposer, toast, uiStore, updatePrefs } from '~/lib/store';
import { Kbd, cx } from './ui';

type Command = { id: string; label: string; group: string; icon: ReactNode; hint?: string; run: () => void; keywords?: string };

function score(text: string, q: string) {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`)) return 2;
  if (t.includes(q)) return 1;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 0.5 : 0;
}

export function CommandPalette() {
  const open = uiStore.use((s) => s.palette);
  const navigate = useNavigate();
  const { user, mailbox } = useMail();
  const labels = useLabels(user.$id).data || [];
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => uiStore.set({ palette: false });

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (folder: string, search?: Record<string, string>) => () => navigate({ to: '/mail/$folder', params: { folder }, search: search as never });
    return [
      { id: 'compose', label: 'New message', group: 'Actions', icon: <PenSquare />, hint: 'C', run: () => openComposer() },
      ...FOLDERS.map((f) => ({ id: `go-${f.id}`, label: `Go to ${f.label}`, group: 'Mailboxes', icon: <f.icon />, run: go(f.id) })),
      ...labels.map((l) => ({
        id: `label-${l.$id}`,
        label: l.name,
        group: 'Labels',
        icon: <Tag style={{ color: l.color }} />,
        run: go('label', { label: l.$id }),
      })),
      { id: 'contacts', label: 'Contacts', group: 'Navigate', icon: <Users />, run: () => navigate({ to: '/mail/contacts' }) },
      { id: 'settings', label: 'Settings', group: 'Navigate', icon: <Settings />, run: () => navigate({ to: '/mail/settings' }) },
      {
        id: 'copy',
        label: 'Copy my address',
        group: 'Actions',
        icon: <Copy />,
        run: () => {
          navigator.clipboard.writeText(mailbox.address);
          toast({ title: 'Address copied', tone: 'success' });
        },
      },
      { id: 'empty', label: 'Empty Trash and Junk', group: 'Actions', icon: <Search />, keywords: 'delete purge', run: () => emptyTrash() },
      { id: 'light', label: 'Use light appearance', group: 'Appearance', icon: <Sun />, keywords: 'theme', run: () => updatePrefs({ theme: 'light' }) },
      { id: 'dark', label: 'Use dark appearance', group: 'Appearance', icon: <Moon />, keywords: 'theme', run: () => updatePrefs({ theme: 'dark' }) },
      { id: 'system', label: 'Match system appearance', group: 'Appearance', icon: <Monitor />, keywords: 'theme auto', run: () => updatePrefs({ theme: 'system' }) },
      { id: 'keys', label: 'Keyboard shortcuts', group: 'Help', icon: <Keyboard />, hint: '?', run: () => uiStore.set({ shortcuts: true }) },
      {
        id: 'logout',
        label: 'Sign out',
        group: 'Account',
        icon: <LogOut />,
        run: async () => {
          await signOut();
          navigate({ to: '/login' });
        },
      },
    ];
  }, [labels, mailbox.address, navigate]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? commands
          .map((c) => ({ c, s: Math.max(score(c.label, term), score(c.keywords || '', term) * 0.8) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.c)
      : commands;
    if (term) {
      list.push({
        id: 'search',
        label: `Search mail for “${q.trim()}”`,
        group: 'Search',
        icon: <Search />,
        run: () => navigate({ to: '/mail/$folder', params: { folder: 'all' }, search: { q: q.trim() } as never }),
      });
    }
    return list;
  }, [q, commands, navigate]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c?: Command) => {
    if (!c) return;
    close();
    c.run();
  };

  if (typeof document === 'undefined') return null;
  let lastGroup = '';
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-[var(--scrim)]" onClick={close} />
          <motion.div
            initial={{ scale: 0.97, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="relative w-full max-w-[600px] overflow-hidden rounded-xl border border-line bg-elevated shadow-pop dark:border-line-strong"
          >
            <div className="flex h-12 items-center gap-3 border-b border-line px-4 dark:border-line-strong">
              <Search className="h-4 w-4 text-fg-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((i) => Math.min(results.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    run(results[active]);
                  } else if (e.key === 'Escape') {
                    close();
                  }
                }}
                placeholder="Search mail or type a command…"
                className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <div ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
              {results.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {header && <div className="px-2.5 pb-1 pt-3 text-[11.5px] font-semibold text-fg-3">{header}</div>}
                    <button
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(c)}
                      className={cx('flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13.5px]', i === active ? 'bg-fill-2 text-fg' : 'text-fg-2')}
                    >
                      <span className={cx('flex w-5 justify-center [&>svg]:h-4 [&>svg]:w-4', i === active ? 'text-fg' : 'text-fg-3')}>{c.icon}</span>
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint && <Kbd>{c.hint}</Kbd>}
                    </button>
                  </div>
                );
              })}
              {!results.length && <div className="py-10 text-center text-[14px] text-fg-3">No results</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
