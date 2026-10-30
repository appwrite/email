import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  LogOut,
  Menu,
  MoreHorizontal,
  PenLine,
  PenSquare,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { openContextMenu, type MenuEntry } from '~/components/ContextMenu';
import { Avatar, Button, Empty, Field, IconButton, Input, Sheet, Spinner, Switch, cx } from '~/components/ui';
import { copyText } from '~/lib/actions';
import { adminApi, generatePassword, isAdmin, type Account } from '~/lib/admin';
import { MAIL_DOMAIN } from '~/lib/appwrite';
import { formatAddress, relativeTime } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { openComposer, toast, uiStore } from '~/lib/store';

export const Route = createFileRoute('/mail/admin')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Admin — Mail' }] }),
  component: AdminPage,
});

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; account: Account }
  | { kind: 'password'; account: Account }
  | { kind: 'delete'; account: Account }
  | { kind: 'created'; email: string; password: string; address: string }
  | null;

function AdminPage() {
  const { user } = useMail();
  const admin = isAdmin(user);
  const overview = useQuery({ queryKey: ['admin'], queryFn: adminApi.overview, enabled: admin });
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [savingSignups, setSavingSignups] = useState(false);

  const accounts = overview.data?.accounts || [];
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return accounts
      .filter((a) => !term || [a.name, a.email, a.address].some((v) => (v || '').toLowerCase().includes(term)))
      .sort((a, b) => Number(b.admin) - Number(a.admin) || (a.name || a.email).localeCompare(b.name || b.email));
  }, [accounts, q]);

  if (!admin) {
    return (
      <div className="relative flex min-w-0 flex-1 bg-bg">
        <Empty overlay icon={<Shield />} title="Admins only">
          Ask an admin on this server for access.
        </Empty>
      </div>
    );
  }

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast({ title: done, tone: 'success' });
      overview.refetch();
    } catch (e: any) {
      toast({ title: 'Something went wrong', description: e.message, tone: 'error' });
    }
  };

  const menuFor = (a: Account): (MenuEntry | false)[] => {
    const self = a.id === user.$id;
    return [
      { heading: a.address || a.email },
      !!a.address && { label: 'New Message', icon: <PenSquare />, onSelect: () => openComposer({ to: [formatAddress({ name: a.name, email: a.address! })], focus: 'body' }) },
      !!a.address && { label: 'Copy Address', icon: <Copy />, onSelect: () => copyText(a.address!, 'Address copied') },
      { separator: true },
      { label: 'Rename…', icon: <PenLine />, onSelect: () => setDialog({ kind: 'rename', account: a }) },
      { label: 'Reset Password…', icon: <KeyRound />, onSelect: () => setDialog({ kind: 'password', account: a }) },
      { label: 'Sign Out Everywhere', icon: <LogOut />, onSelect: () => run(() => adminApi.update(a.id, { signOut: true }), `Signed ${a.name || a.email} out everywhere`) },
      { separator: true },
      a.admin
        ? { label: 'Remove Admin', icon: <ShieldOff />, disabled: self, onSelect: () => run(() => adminApi.update(a.id, { admin: false }), `${a.name || a.email} is no longer an admin`) }
        : { label: 'Make Admin', icon: <Shield />, onSelect: () => run(() => adminApi.update(a.id, { admin: true }), `${a.name || a.email} is now an admin`) },
      a.status
        ? { label: 'Block Account', icon: <Ban />, disabled: self, onSelect: () => run(() => adminApi.update(a.id, { blocked: true }), `Blocked ${a.name || a.email}`) }
        : { label: 'Unblock Account', icon: <Check />, onSelect: () => run(() => adminApi.update(a.id, { blocked: false }), `Unblocked ${a.name || a.email}`) },
      { separator: true },
      { label: 'Delete Account…', icon: <Trash2 />, danger: true, disabled: self, onSelect: () => setDialog({ kind: 'delete', account: a }) },
    ];
  };

  const signupsOpen = !!overview.data?.signupsOpen;
  const totalMessages = accounts.reduce((n, a) => n + a.messages, 0);

  return (
    <div className="flex min-w-0 flex-1 bg-bg">
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="flex h-[52px] items-center gap-1 px-3 md:hidden">
          <IconButton label="Mailboxes" onClick={() => uiStore.set({ sidebarOpen: true })}>
            <Menu className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="mx-auto max-w-[860px] space-y-8 px-4 pb-24 pt-4 sm:px-6 md:pt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-[30px] font-bold leading-none tracking-[-0.03em]">Admin</h1>
              <p className="mt-2 text-[14px] text-fg-2">Manage who has an account on this server, and whether anyone can sign up.</p>
            </div>
            <IconButton label="Refresh" anim="none" onClick={() => overview.refetch()}>
              <RefreshCw className={cx('h-[17px] w-[17px]', overview.isFetching && 'animate-spin')} />
            </IconButton>
          </div>

          {/* Sign-ups */}
          <section className="overflow-hidden rounded-2xl bg-card shadow-[0_0_0_0.5px_var(--line-strong)]">
            <div className="flex items-center gap-4 px-5 py-4">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-white', signupsOpen ? 'bg-success' : 'bg-fg-3')}>
                <UserPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-semibold">Allow new sign-ups</div>
                <div className="text-[13px] leading-snug text-fg-2">
                  {signupsOpen
                    ? 'Anyone can create an account and claim an address.'
                    : 'Closed. Only admins can add accounts; the sign-up page tells visitors to ask an admin.'}
                </div>
              </div>
              {overview.isLoading || savingSignups ? (
                <Spinner size={16} className="text-fg-3" />
              ) : (
                <Switch
                  checked={signupsOpen}
                  label="Allow new sign-ups"
                  onChange={async (v) => {
                    setSavingSignups(true);
                    await run(() => adminApi.setSignups(v), v ? 'Sign-ups are open' : 'Sign-ups are closed');
                    setSavingSignups(false);
                  }}
                />
              )}
            </div>
          </section>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Accounts', accounts.length],
              ['Admins', accounts.filter((a) => a.admin).length],
              ['Messages', totalMessages],
            ].map(([label, n]) => (
              <div key={label} className="rounded-2xl bg-sunken px-5 py-4">
                <div className="text-[12.5px] font-medium text-fg-2">{label}</div>
                <div className="mt-1 font-display text-[26px] font-bold tabular-nums tracking-[-0.02em]">{overview.isLoading ? '–' : Number(n).toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Accounts */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 text-[17px] font-semibold">Accounts</h2>
              <div className="flex h-8 w-56 items-center gap-2 rounded-lg bg-fill px-2.5 max-sm:hidden">
                <Search className="h-3.5 w-3.5 text-fg-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
              </div>
              <Button variant="primary" size="sm" onClick={() => setDialog({ kind: 'create' })}>
                <Plus className="h-4 w-4" /> New Account
              </Button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-card shadow-[0_0_0_0.5px_var(--line-strong)]">
              {overview.isLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner className="text-fg-3" />
                </div>
              ) : overview.isError ? (
                <div className="px-5 py-8 text-center text-[14px] text-fg-2">{(overview.error as Error).message}</div>
              ) : list.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-[14px] text-fg-2">
                  <Users className="h-6 w-6 text-fg-3" /> No accounts match.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((a) => (
                    <AccountRow key={a.id} account={a} self={a.id === user.$id} onMenu={(e) => openContextMenu(e, menuFor(a))} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <CreateSheet
        open={dialog?.kind === 'create'}
        onClose={() => setDialog(null)}
        onCreated={(d) => {
          overview.refetch();
          setDialog({ kind: 'created', ...d });
        }}
      />
      <Sheet open={dialog?.kind === 'created'} onClose={() => setDialog(null)} className="max-w-md">
        {dialog?.kind === 'created' && (
          <div className="p-6">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">Account created</h2>
            <p className="mt-1.5 text-[14px] text-fg-2">Share these details privately. The password isn’t shown again.</p>
            <div className="mt-5 space-y-2">
              {[
                ['Address', dialog.address],
                ['Sign in with', dialog.email],
                ['Password', dialog.password],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-3 rounded-xl bg-fill px-4 py-2.5">
                  <span className="w-24 shrink-0 text-[12.5px] text-fg-3">{label}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{value}</code>
                  <IconButton size="sm" label={`Copy ${label.toLowerCase()}`} onClick={() => copyText(value, 'Copied')}>
                    <Copy className="h-4 w-4" />
                  </IconButton>
                </div>
              ))}
            </div>
            <Button variant="primary" className="mt-6 w-full" onClick={() => setDialog(null)}>
              Done
            </Button>
          </div>
        )}
      </Sheet>
      <TextSheet
        open={dialog?.kind === 'rename'}
        title="Rename account"
        label="Name"
        initial={dialog?.kind === 'rename' ? dialog.account.name : ''}
        cta="Save"
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          if (dialog?.kind !== 'rename') return;
          await run(() => adminApi.update(dialog.account.id, { name }), 'Name updated');
          setDialog(null);
        }}
      />
      <TextSheet
        open={dialog?.kind === 'password'}
        title="Reset password"
        label="New password"
        hint="They’re signed out everywhere and use this password next time."
        initial=""
        generate
        cta="Reset Password"
        onClose={() => setDialog(null)}
        onSubmit={async (password) => {
          if (dialog?.kind !== 'password') return;
          await run(() => adminApi.update(dialog.account.id, { password }), 'Password reset');
          setDialog(null);
        }}
      />
      <Sheet open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} className="max-w-md">
        {dialog?.kind === 'delete' && (
          <DeleteConfirm
            account={dialog.account}
            onCancel={() => setDialog(null)}
            onConfirm={async () => {
              await run(() => adminApi.remove(dialog.account.id), `Deleted ${dialog.account.name || dialog.account.email}`);
              setDialog(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'accent' | 'danger' | 'muted' }) {
  return (
    <span
      className={cx(
        'rounded-md px-1.5 py-px text-[10.5px] font-semibold',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'danger' && 'bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger',
        tone === 'muted' && 'bg-fill-2 text-fg-2',
      )}
    >
      {children}
    </span>
  );
}

function AccountRow({ account: a, self, onMenu }: { account: Account; self: boolean; onMenu: (e: MouseEvent) => void }) {
  return (
    <li className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-fill/60" onContextMenu={onMenu}>
      <Avatar name={a.name || a.email} email={a.address || a.email} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14.5px] font-semibold">{a.name || a.email}</span>
          {self && <Badge tone="muted">You</Badge>}
          {a.admin && <Badge tone="accent">Admin</Badge>}
          {!a.status && <Badge tone="danger">Blocked</Badge>}
        </div>
        <div className="truncate text-[13px] text-fg-2">{a.address || 'No address yet'}</div>
        <div className="truncate text-[12px] text-fg-3">Signs in as {a.email}</div>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <div className="text-[13px] tabular-nums text-fg">{a.messages.toLocaleString()} messages</div>
        <div className="text-[12px] text-fg-3">{a.accessedAt ? `Active ${relativeTime(a.accessedAt)}` : `Joined ${relativeTime(a.createdAt)}`}</div>
      </div>
      <IconButton label="Account actions" onClick={(e) => onMenu(e)} className="shrink-0">
        <MoreHorizontal className="h-[18px] w-[18px]" />
      </IconButton>
    </li>
  );
}

function CreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (d: { email: string; password: string; address: string }) => void }) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [admin, setAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const suggest = (n: string) =>
    n
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 32);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await adminApi.create({ name: name.trim(), handle: handle.trim().toLowerCase(), email: email.trim(), password, admin });
      onCreated({ email: email.trim(), password, address: `${handle.trim().toLowerCase()}@${MAIL_DOMAIN}` });
      setName('');
      setHandle('');
      setEmail('');
      setPassword(generatePassword());
      setAdmin(false);
    } catch (err: any) {
      setError(err.message || 'Could not create the account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} className="max-w-md">
      <form className="p-6" onSubmit={submit}>
        <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">New account</h2>
        <p className="mt-1 text-[13.5px] text-fg-2">Creates a sign-in and an email address, even while sign-ups are closed.</p>
        {error && <div className="mt-4 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-danger">{error}</div>}
        <div className="mt-5 space-y-4">
          <Field label="Full name">
            <Input
              autoFocus
              required
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                if (!handle || handle === suggest(name)) setHandle(suggest(v));
                setName(v);
              }}
              placeholder="Ada Lovelace"
            />
          </Field>
          <Field label="Email address">
            <div className="flex h-10 items-center overflow-hidden rounded-lg border border-line bg-transparent focus-within:border-accent dark:border-line-strong">
              <input
                required
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="ada"
                className="h-full min-w-0 flex-1 bg-transparent pl-3 text-[14px] outline-none"
                spellCheck={false}
                autoComplete="off"
              />
              <span className="truncate pr-3 text-[13px] text-fg-3">@{MAIL_DOMAIN}</span>
            </div>
          </Field>
          <Field label="Sign-in email" hint="Where they sign in and recover their password.">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@example.com" autoComplete="off" />
          </Field>
          <Field label="Temporary password">
            <div className="flex gap-2">
              <Input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 font-mono" autoComplete="new-password" />
              <Button type="button" onClick={() => setPassword(generatePassword())}>
                Generate
              </Button>
            </div>
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-fill px-4 py-3">
            <span>
              <span className="block text-[14px] font-medium">Make admin</span>
              <span className="block text-[12.5px] text-fg-2">Can manage accounts and sign-ups.</span>
            </span>
            <Switch checked={admin} onChange={setAdmin} label="Make admin" />
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          <Button type="button" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" loading={saving}>
            Create Account
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function TextSheet({
  open,
  title,
  label,
  hint,
  initial,
  cta,
  generate,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  hint?: string;
  initial: string;
  cta: string;
  generate?: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [seed, setSeed] = useState(initial);
  if (open && seed !== initial) {
    setSeed(initial);
    setValue(initial || (generate ? generatePassword() : ''));
  }
  if (open && generate && !value) setValue(generatePassword());
  return (
    <Sheet open={open} onClose={onClose} className="max-w-md">
      <form
        className="p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim()) return;
          setSaving(true);
          await onSubmit(value.trim());
          setSaving(false);
          setValue('');
        }}
      >
        <h2 className="mb-5 font-display text-[20px] font-bold tracking-[-0.01em]">{title}</h2>
        <Field label={label} hint={hint}>
          <div className="flex gap-2">
            <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={cx('flex-1', generate && 'font-mono')} minLength={generate ? 8 : 1} />
            {generate && (
              <Button type="button" onClick={() => setValue(generatePassword())}>
                Generate
              </Button>
            )}
          </div>
        </Field>
        {generate && value && (
          <button type="button" onClick={() => copyText(value, 'Password copied')} className="mt-2 text-[13px] font-medium text-accent">
            Copy password
          </button>
        )}
        <div className="mt-6 flex gap-2">
          <Button type="button" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" loading={saving}>
            {cta}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function DeleteConfirm({ account: a, onCancel, onConfirm }: { account: Account; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const key = a.handle || a.email;
  return (
    <form
      className="p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onConfirm();
        setBusy(false);
      }}
    >
      <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">Delete {a.name || a.email}?</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-fg-2">
        This permanently deletes the account, its address and all {a.messages.toLocaleString()} messages, attachments, contacts and keys. It can’t be undone.
      </p>
      <Field label={`Type ${key} to confirm`} className="mt-5">
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
      <div className="mt-6 flex gap-2">
        <Button type="button" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" className="flex-1" loading={busy} disabled={typed.trim() !== key}>
          Delete Account
        </Button>
      </div>
    </form>
  );
}
