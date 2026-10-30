import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AuthenticatorType, ID } from 'appwrite';
import {
  Ban,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Filter,
  KeyRound,
  Laptop,
  Menu,
  Palette,
  PenLine,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Field, IconButton, Input, Segmented, Sheet, Switch, cx } from '~/components/ui';
import { callApi } from '~/lib/api';
import { API_SCOPES, API_URL, INSTALL, MCP_URL } from '~/lib/developer';
import { DATABASE_ID, TABLES, account, qrUrl, tablesDB, type Rule, type SettingsRow } from '~/lib/appwrite';
import { Query, type Models } from 'appwrite';
import { LABEL_COLORS } from '~/lib/folders';
import { isEmail, relativeTime } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { createLabel, queryClient, useLabels, useSettings } from '~/lib/queries';
import { forgetDevice, signOut } from '~/lib/session';
import { prefsStore, toast, uiStore, updatePrefs, type Prefs } from '~/lib/store';

type Section = 'account' | 'appearance' | 'notifications' | 'mail' | 'organize' | 'security' | 'developer';

export const Route = createFileRoute('/mail/settings')({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { section?: Section } => ({
    section: PAGES.some((p) => p.id === s.section) ? (s.section as Section) : undefined,
  }),
  component: SettingsPage,
});

// Settings are split into pages, each with its own URL (?section=…).
const PAGES: { id: Section; label: string; hint: string; icon: typeof User; tint: string }[] = [
  { id: 'account', label: 'Account', hint: 'Address, name, password', icon: User, tint: '#8e8e93' },
  { id: 'appearance', label: 'Appearance', hint: 'Theme, density, previews', icon: Palette, tint: '#5856d6' },
  { id: 'notifications', label: 'Notifications', hint: 'Alerts and sounds', icon: Bell, tint: '#ff3b30' },
  { id: 'mail', label: 'Mail', hint: 'Signature, vacation reply, forwarding', icon: PenLine, tint: '#007aff' },
  { id: 'organize', label: 'Organize', hint: 'Rules, labels, blocked senders', icon: Filter, tint: '#34c759' },
  { id: 'security', label: 'Security', hint: 'Two-factor and devices', icon: ShieldCheck, tint: '#ff9500' },
  { id: 'developer', label: 'API & MCP', hint: 'Assistants and API keys', icon: Code2, tint: '#30b0c7' },
];

function PageIcon({ page, size = 28 }: { page: (typeof PAGES)[number]; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: page.tint, width: size, height: size }}>
      <page.icon style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}

function Group({ id, title, footer, children }: { id: string; title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="eyebrow no-mark mb-2.5 px-1 text-[11.5px] text-fg-3">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card dark:divide-line-strong/60 dark:border-line-strong/60">{children}</div>
      {footer && <p className="mt-2 px-1 text-[12.5px] leading-relaxed text-fg-3">{footer}</p>}
    </section>
  );
}

function Item({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px]">{label}</div>
        {hint && <div className="text-[12.5px] text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// Preferences apply locally at once and sync to Appwrite account prefs, so
// they follow the user to every device.
async function savePrefs(patch: Partial<Prefs>) {
  updatePrefs(patch);
  const user = await account.updatePrefs({ prefs: { ui: prefsStore.get() } }).catch(() => null);
  if (user) queryClient.setQueryData(['account'], user);
}

function SettingsPage() {
  const { user } = useMail();
  const settings = useSettings(user.$id);
  const navigate = useNavigate();
  const { section } = Route.useSearch();
  const go = (id?: Section) => navigate({ to: '/mail/settings', search: id ? { section: id } : {}, replace: !!section && !!id });
  // Wide screens always show a page; narrow ones start from the list.
  const active = section || 'account';
  const page = PAGES.find((p) => p.id === active)!;

  const patchSettings = async (data: Partial<SettingsRow>, message = 'Saved') => {
    const prev = settings.data;
    if (prev) queryClient.setQueryData(['settings', user.$id], { ...prev, ...data });
    try {
      await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.settings, rowId: user.$id, data });
      if (message) toast({ title: message, tone: 'success', duration: 1800 });
    } catch (e: any) {
      if (prev) queryClient.setQueryData(['settings', user.$id], prev);
      toast({ title: 'Could not save', description: e.message, tone: 'error' });
    }
  };

  const content = (() => {
    const data = settings.data;
    switch (active) {
      case 'account':
        return (
          <>
            <AccountSection />
            <DangerSection />
          </>
        );
      case 'appearance':
        return <AppearanceSection />;
      case 'notifications':
        return <NotificationsSection />;
      case 'mail':
        return data ? (
          <>
            <SignatureSection settings={data} save={patchSettings} />
            <VacationSection settings={data} save={patchSettings} />
            <ForwardingSection settings={data} save={patchSettings} />
          </>
        ) : null;
      case 'organize':
        return data ? (
          <>
            <RulesSection settings={data} save={patchSettings} />
            <LabelsSection />
            <BlockedSection settings={data} save={patchSettings} />
          </>
        ) : null;
      case 'security':
        return <SecuritySection />;
      case 'developer':
        return <DeveloperSection />;
    }
  })();

  return (
    <div className="flex min-w-0 flex-1 bg-bg">
      {/* Page list: a sidebar on wide screens, the first screen on narrow ones. */}
      <nav className={cx('scroll-thin w-full shrink-0 overflow-y-auto border-r border-line bg-sidebar lg:block lg:w-[260px]', section ? 'hidden' : 'block')}>
        <div className="flex h-[52px] items-center gap-1 px-3 lg:hidden">
          <IconButton label="Mailboxes" className="md:hidden" onClick={() => uiStore.set({ sidebarOpen: true })}>
            <Menu className="h-5 w-5" />
          </IconButton>
        </div>
        <h1 className="px-5 pb-4 font-display text-[28px] font-bold leading-none tracking-[-0.03em] lg:pt-8">Settings</h1>
        <div className="mx-3 overflow-hidden rounded-xl bg-card shadow-[0_0_0_0.5px_var(--line)] lg:mx-2 lg:bg-transparent lg:shadow-none">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              className={cx(
                'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors lg:rounded-lg lg:py-2',
                i > 0 && 'border-t border-line lg:border-t-0',
                active === p.id ? 'lg:bg-fill-2' : 'hover:bg-fill',
              )}
            >
              <PageIcon page={p} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium lg:text-[13.5px]">{p.label}</span>
                <span className="block truncate text-[12px] text-fg-3 lg:hidden">{p.hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-fg-3 lg:hidden" />
            </button>
          ))}
        </div>
      </nav>

      <div className={cx('scroll-thin min-w-0 flex-1 overflow-y-auto', !section && 'hidden lg:block')}>
        <div className="flex h-[52px] items-center gap-1 px-2 lg:hidden">
          <button onClick={() => go()} className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[15px] text-accent">
            <ChevronLeft className="h-5 w-5" /> Settings
          </button>
        </div>
        <div key={active} className="fade-up mx-auto max-w-[680px] space-y-9 px-4 pb-24 pt-2 sm:px-6 lg:pt-10">
          <div className="flex items-center gap-3">
            <PageIcon page={page} size={36} />
            <div>
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-[-0.025em]">{page.label}</h2>
              <p className="text-[13px] text-fg-3">{page.hint}</p>
            </div>
          </div>
          {content}
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  const { user, mailbox } = useMail();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ old: '', next: '' });
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Group id="account" title="Your address">
        <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-center">
          <img src={qrUrl(`mailto:${mailbox.address}`, 220)} alt="QR code for your address" width={110} height={110} className="rounded-lg bg-white p-1.5" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="eyebrow">Receive mail at</div>
            <div className="mt-1 break-all font-mono text-[13.5px] leading-relaxed">{mailbox.address}</div>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                navigator.clipboard.writeText(mailbox.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy address'}
            </Button>
          </div>
        </div>
      </Group>

      <Group id="profile" title="Account" footer={user.emailVerification ? undefined : 'Verify your sign-in email to make password recovery work.'}>
        <form
          className="flex items-center gap-3 px-4 py-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('name');
            try {
              await callApi('PATCH', '/mailbox', { name });
              queryClient.setQueryData(['account'], await account.get());
              toast({ title: 'Name updated', tone: 'success' });
            } catch (err: any) {
              toast({ title: 'Could not update name', description: err.message, tone: 'error' });
            } finally {
              setBusy('');
            }
          }}
        >
          <span className="w-24 shrink-0 text-[14.5px]">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none" />
          {name !== user.name && (
            <Button size="sm" variant="primary" type="submit" loading={busy === 'name'}>
              Save
            </Button>
          )}
        </form>
        <Item label="Sign-in email" hint={user.email}>
          {user.emailVerification ? (
            <span className="inline-flex items-center gap-1 text-[13px] text-success">
              <Check className="h-4 w-4" /> Verified
            </span>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                account
                  .createVerification({ url: `${location.origin}/verify` })
                  .then(() => toast({ title: 'Verification email sent', tone: 'success' }))
                  .catch((e) => toast({ title: e.message, tone: 'error' }))
              }
            >
              Verify
            </Button>
          )}
        </Item>
        <form
          className="space-y-2 px-4 py-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('pw');
            try {
              await account.updatePassword({ password: pw.next, oldPassword: pw.old });
              setPw({ old: '', next: '' });
              toast({ title: 'Password changed', tone: 'success' });
            } catch (err: any) {
              toast({ title: 'Could not change password', description: err.message, tone: 'error' });
            } finally {
              setBusy('');
            }
          }}
        >
          <div className="text-[14.5px]">Change password</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="password" placeholder="Current password" autoComplete="current-password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} className="h-9 text-[14px]" />
            <Input type="password" placeholder="New password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="h-9 text-[14px]" />
            <Button type="submit" variant="primary" disabled={pw.next.length < 8} loading={busy === 'pw'}>
              Update
            </Button>
          </div>
        </form>
      </Group>
    </>
  );
}

function AppearanceSection() {
  const prefs = prefsStore.use((s) => s);
  return (
    <Group id="appearance" title="Appearance">
      <Item label="Appearance">
        <Segmented
          value={prefs.theme}
          onChange={(theme) => savePrefs({ theme })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'Auto' },
          ]}
        />
      </Item>
      <Item label="List density">
        <Segmented
          value={prefs.density}
          onChange={(density) => savePrefs({ density })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </Item>
      <Item label="Show message previews">
        <Switch checked={prefs.snippets} onChange={(snippets) => savePrefs({ snippets })} />
      </Item>
      <Item label="Load remote images" hint="Off blocks trackers hidden in images until you choose to load them.">
        <Switch checked={prefs.remoteImages} onChange={(remoteImages) => savePrefs({ remoteImages })} />
      </Item>
    </Group>
  );
}

function NotificationsSection() {
  const prefs = prefsStore.use((s) => s);
  return (
    <Group id="notifications" title="Notifications" footer="New mail arrives in real time, so alerts fire the instant a message is delivered.">
      <Item label="Desktop notifications" hint="Shown when this tab is in the background.">
        <Switch
          checked={prefs.notifications}
          onChange={async (on) => {
            if (on && 'Notification' in window && Notification.permission !== 'granted') {
              const result = await Notification.requestPermission();
              if (result !== 'granted') return toast({ title: 'Notifications are blocked in your browser', tone: 'error' });
            }
            savePrefs({ notifications: on });
          }}
        />
      </Item>
      <Item label="Sound for new mail">
        <Switch checked={prefs.sound} onChange={(sound) => savePrefs({ sound })} />
      </Item>
    </Group>
  );
}

type SectionProps = { settings: SettingsRow; save: (data: Partial<SettingsRow>, message?: string) => Promise<void> };

function SignatureSection({ settings, save }: SectionProps) {
  const [value, setValue] = useState(settings.signature || '');
  return (
    <Group id="signature" title="Signature" footer="Added to new messages, replies and forwards.">
      <div className="p-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          placeholder={'Best,\nYour name'}
          className="w-full resize-y rounded-md border border-line bg-transparent p-3 text-[14px] leading-relaxed outline-none focus:border-fg-3 dark:border-line-strong dark:bg-fill/50"
        />
        {value !== (settings.signature || '') && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => save({ signature: value }, 'Signature saved')}>
              Save signature
            </Button>
          </div>
        )}
      </div>
    </Group>
  );
}

function VacationSection({ settings, save }: SectionProps) {
  const [subject, setSubject] = useState(settings.vacationSubject || '');
  const [message, setMessage] = useState(settings.vacationMessage || '');
  const [until, setUntil] = useState(settings.vacationUntil ? settings.vacationUntil.slice(0, 10) : '');
  const dirty = subject !== (settings.vacationSubject || '') || message !== (settings.vacationMessage || '') || until !== (settings.vacationUntil?.slice(0, 10) || '');
  return (
    <Group id="vacation" title="Vacation reply" footer="Each sender gets one automatic reply every four days.">
      <Item label="Automatic reply" hint={settings.vacationEnabled ? 'On' : 'Off'}>
        <Switch checked={settings.vacationEnabled} onChange={(v) => save({ vacationEnabled: v }, v ? 'Vacation reply on' : 'Vacation reply off')} />
      </Item>
      <div className={cx('space-y-3 p-4', !settings.vacationEnabled && 'opacity-60')}>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Out of office" className="h-9 text-[14px]" />
          </Field>
          <Field label="Until (optional)">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 text-[14px]" />
          </Field>
        </div>
        <Field label="Message">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Thanks for your email. I’m away until Monday and will reply when I’m back."
            className="w-full resize-y rounded-md border border-line bg-transparent p-3 text-[14px] outline-none focus:border-fg-3 dark:border-line-strong dark:bg-fill/50"
          />
        </Field>
        {dirty && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                save({ vacationSubject: subject, vacationMessage: message, vacationUntil: until ? new Date(`${until}T23:59:59`).toISOString() : null }, 'Vacation reply saved')
              }
            >
              Save
            </Button>
          </div>
        )}
      </div>
    </Group>
  );
}

function ForwardingSection({ settings, save }: SectionProps) {
  const [value, setValue] = useState(settings.forwardTo || '');
  return (
    <Group id="forwarding" title="Forwarding" footer="Forward a copy of every new message, attachments included.">
      <form
        className="flex items-center gap-2 px-4 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (value && !isEmail(value)) return toast({ title: 'Enter a valid email address', tone: 'error' });
          save({ forwardTo: value.trim().toLowerCase() }, value ? 'Forwarding on' : 'Forwarding off');
        }}
      >
        <input value={value} onChange={(e) => setValue(e.target.value)} type="email" placeholder="you@elsewhere.com" className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-fg-3" />
        {value !== (settings.forwardTo || '') && (
          <Button size="sm" variant="primary" type="submit">
            {value ? 'Save' : 'Turn off'}
          </Button>
        )}
      </form>
    </Group>
  );
}

const FIELD_LABELS = { from: 'From', to: 'To', subject: 'Subject', body: 'Message' };
const OP_LABELS = { contains: 'contains', equals: 'is', startsWith: 'begins with', endsWith: 'ends with' };

function RulesSection({ settings, save }: SectionProps) {
  const { user } = useMail();
  const labels = useLabels(user.$id).data || [];
  const rules: Rule[] = (() => {
    try {
      return JSON.parse(settings.rules || '[]');
    } catch {
      return [];
    }
  })();
  const [editing, setEditing] = useState<Rule | null>(null);
  const persist = (next: Rule[], msg = 'Rules saved') => save({ rules: JSON.stringify(next) }, msg);

  const describe = (r: Rule) => {
    const cond = r.conditions.map((c) => `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} “${c.value}”`).join(r.match === 'any' ? ' or ' : ' and ');
    const acts = [
      r.actions.folder && `move to ${r.actions.folder}`,
      r.actions.label && `label ${labels.find((l) => l.$id === r.actions.label)?.name || ''}`,
      r.actions.read && 'mark read',
      r.actions.star && 'star',
    ]
      .filter(Boolean)
      .join(', ');
    return `If ${cond} → ${acts || 'do nothing'}`;
  };

  return (
    <Group id="rules" title="Rules" footer="Rules run on the server as each email arrives, before it reaches any device.">
      {rules.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
          <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
            <div className="truncate text-[14.5px] font-medium">{r.name || 'Untitled rule'}</div>
            <div className="truncate text-[12.5px] text-fg-3">{describe(r)}</div>
          </button>
          <Switch checked={r.enabled} onChange={(v) => persist(rules.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))} />
        </div>
      ))}
      <button
        onClick={() =>
          setEditing({ id: ID.unique(), name: '', enabled: true, match: 'all', conditions: [{ field: 'from', op: 'contains', value: '' }], actions: { folder: 'archive' } })
        }
        className="flex h-12 w-full items-center gap-2 px-4 text-[14.5px] text-accent hover:bg-fill"
      >
        <Plus className="h-4 w-4" /> Add rule
      </button>
      <Sheet open={!!editing} onClose={() => setEditing(null)} className="max-w-xl">
        {editing && (
          <RuleEditor
            rule={editing}
            labels={labels}
            onCreateLabel={(name) => createLabel(user.$id, name, LABEL_COLORS[labels.length % LABEL_COLORS.length])}
            onCancel={() => setEditing(null)}
            onDelete={() => {
              persist(rules.filter((x) => x.id !== editing.id), 'Rule deleted');
              setEditing(null);
            }}
            onSave={(rule) => {
              const exists = rules.some((x) => x.id === rule.id);
              persist(exists ? rules.map((x) => (x.id === rule.id ? rule : x)) : [...rules, rule]);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </Group>
  );
}

function RuleEditor({
  rule,
  labels,
  onSave,
  onCancel,
  onDelete,
  onCreateLabel,
}: {
  rule: Rule;
  labels: { $id: string; name: string }[];
  onSave: (r: Rule) => void;
  onCancel: () => void;
  onDelete: () => void;
  onCreateLabel: (name: string) => Promise<{ $id: string }>;
}) {
  const [r, setR] = useState<Rule>(rule);
  const select = 'h-9 rounded-md border border-line bg-transparent px-2 text-[13px] outline-none focus:border-fg-3 dark:border-line-strong dark:bg-fill/50';
  return (
    <div className="p-6">
      <h2 className="mb-4 font-display font-bold text-[20px] tracking-[-0.01em]">{rule.name ? 'Edit rule' : 'New rule'}</h2>
      <Field label="Name">
        <Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Newsletters" className="h-9 text-[14px]" />
      </Field>
      <div className="mt-5 flex items-center gap-2 text-[14px]">
        If
        <select className={select} value={r.match} onChange={(e) => setR({ ...r, match: e.target.value as Rule['match'] })}>
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        of these conditions are met:
      </div>
      <div className="mt-3 space-y-2">
        {r.conditions.map((c, i) => (
          <div key={i} className="flex gap-2">
            <select className={select} value={c.field} onChange={(e) => setR({ ...r, conditions: r.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value as any } : x)) })}>
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className={select} value={c.op} onChange={(e) => setR({ ...r, conditions: r.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as any } : x)) })}>
              {Object.entries(OP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              value={c.value}
              onChange={(e) => setR({ ...r, conditions: r.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
              className={cx(select, 'min-w-0 flex-1')}
              placeholder="newsletter@"
            />
            <IconButton label="Remove condition" disabled={r.conditions.length === 1} onClick={() => setR({ ...r, conditions: r.conditions.filter((_, j) => j !== i) })}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
        <button onClick={() => setR({ ...r, conditions: [...r.conditions, { field: 'subject', op: 'contains', value: '' }] })} className="text-[13.5px] font-medium text-accent">
          + Add condition
        </button>
      </div>
      <div className="mt-5 text-[14px]">Then:</div>
      <div className="mt-2 space-y-2 rounded-lg border border-line bg-sunken p-3 text-[13.5px] dark:border-line-strong/60">
        <label className="flex items-center justify-between gap-3">
          Move to
          <select className={select} value={r.actions.folder || ''} onChange={(e) => setR({ ...r, actions: { ...r.actions, folder: e.target.value || undefined } })}>
            <option value="">Keep in Inbox</option>
            <option value="archive">Archive</option>
            <option value="spam">Junk</option>
            <option value="trash">Trash</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          Apply label
          <select
            className={select}
            value={r.actions.label || ''}
            onChange={async (e) => {
              if (e.target.value === '__new') {
                const name = prompt('Label name');
                if (name) {
                  const l = await onCreateLabel(name);
                  setR({ ...r, actions: { ...r.actions, label: l.$id } });
                }
                return;
              }
              setR({ ...r, actions: { ...r.actions, label: e.target.value || undefined } });
            }}
          >
            <option value="">None</option>
            {labels.map((l) => (
              <option key={l.$id} value={l.$id}>
                {l.name}
              </option>
            ))}
            <option value="__new">New label…</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          Mark as read <Switch checked={!!r.actions.read} onChange={(v) => setR({ ...r, actions: { ...r.actions, read: v } })} />
        </label>
        <label className="flex items-center justify-between">
          Star <Switch checked={!!r.actions.star} onChange={(v) => setR({ ...r, actions: { ...r.actions, star: v } })} />
        </label>
      </div>
      <div className="mt-6 flex items-center gap-2">
        {rule.name && (
          <Button variant="ghost" className="text-danger" onClick={onDelete}>
            Delete
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={r.conditions.some((c) => !c.value.trim())} onClick={() => onSave({ ...r, name: r.name.trim() || 'Untitled rule' })}>
          Save rule
        </Button>
      </div>
    </div>
  );
}

function LabelsSection() {
  const { user } = useMail();
  const labels = useLabels(user.$id).data || [];
  const [name, setName] = useState('');
  return (
    <Group id="labels" title="Labels">
      {labels.map((l) => (
        <div key={l.$id} className="flex items-center gap-3 px-4 py-2">
          <div className="flex gap-1">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                onClick={async () => {
                  await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.labels, rowId: l.$id, data: { color: c } });
                  queryClient.invalidateQueries({ queryKey: ['labels'] });
                }}
                className={cx('h-3.5 w-3.5 rounded-full transition', l.color === c ? 'ring-2 ring-fg-3 ring-offset-1 ring-offset-surface' : 'opacity-50 hover:opacity-100')}
                style={{ background: c }}
              />
            ))}
          </div>
          <input
            defaultValue={l.name}
            onBlur={async (e) => {
              const v = e.target.value.trim();
              if (v && v !== l.name) {
                await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.labels, rowId: l.$id, data: { name: v } });
                queryClient.invalidateQueries({ queryKey: ['labels'] });
              }
            }}
            className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
          />
          <IconButton
            label="Delete label"
            onClick={async () => {
              await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.labels, rowId: l.$id });
              queryClient.invalidateQueries({ queryKey: ['labels'] });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
      <form
        className="flex items-center gap-2 px-4 py-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createLabel(user.$id, name.trim(), LABEL_COLORS[labels.length % LABEL_COLORS.length]);
          setName('');
        }}
      >
        <Plus className="h-4 w-4 text-accent" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New label" className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-fg-3" />
      </form>
    </Group>
  );
}

function BlockedSection({ settings, save }: SectionProps) {
  const [value, setValue] = useState('');
  const list = settings.blockedSenders || [];
  return (
    <Group id="blocked" title="Blocked senders" footer="Mail from blocked addresses goes straight to Trash. Use @domain.com to block a whole domain.">
      {list.map((b) => (
        <Item key={b} label={b}>
          <IconButton label={`Unblock ${b}`} onClick={() => save({ blockedSenders: list.filter((x) => x !== b) }, 'Unblocked')}>
            <X className="h-4 w-4" />
          </IconButton>
        </Item>
      ))}
      <form
        className="flex items-center gap-2 px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim().toLowerCase();
          if (!v || (!isEmail(v) && !/^@[^@\s]+\.[^@\s]+$/.test(v))) return toast({ title: 'Enter an address or @domain', tone: 'error' });
          save({ blockedSenders: [...new Set([...list, v])] }, 'Blocked');
          setValue('');
        }}
      >
        <Ban className="h-4 w-4 text-fg-3" />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="spam@example.com or @example.com" className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-fg-3" />
      </form>
    </Group>
  );
}

function SecuritySection() {
  const { user } = useMail();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => account.listSessions() });
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(user.mfa);

  useEffect(() => setMfa(user.mfa), [user.mfa]);

  const startMfa = async () => {
    try {
      const res = await account.createMfaAuthenticator({ type: AuthenticatorType.Totp });
      setSetup({ secret: res.secret, uri: res.uri });
      setOtp('');
    } catch (e: any) {
      toast({ title: 'Could not start setup', description: e.message, tone: 'error' });
    }
  };

  const verifyMfa = async () => {
    setBusy(true);
    try {
      await account.updateMfaAuthenticator({ type: AuthenticatorType.Totp, otp });
      const recovery = await account.createMfaRecoveryCodes();
      const updated = await account.updateMFA({ mfa: true });
      queryClient.setQueryData(['account'], updated);
      setMfa(true);
      setSetup(null);
      setCodes(recovery.recoveryCodes);
    } catch (e: any) {
      toast({ title: 'That code didn’t work', description: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async () => {
    try {
      const updated = await account.updateMFA({ mfa: false });
      await account.deleteMfaAuthenticator({ type: AuthenticatorType.Totp }).catch(() => {});
      queryClient.setQueryData(['account'], updated);
      setMfa(false);
      toast({ title: 'Two-factor authentication off', tone: 'success' });
    } catch (e: any) {
      toast({ title: 'Could not turn off 2FA', description: e.message, tone: 'error' });
    }
  };

  return (
    <Group id="security" title="Security" footer="Sessions, authenticator apps and recovery codes.">
      <Item label="Two-factor authentication" hint={mfa ? 'On — codes from your authenticator app' : 'Add a second step when signing in'}>
        {mfa ? (
          <Button size="sm" onClick={disableMfa}>
            Turn off
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={startMfa}>
            <KeyRound className="h-3.5 w-3.5" /> Set up
          </Button>
        )}
      </Item>
      <div className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-fg-3">Signed-in devices</div>
      {(sessions.data?.sessions || []).map((s) => (
        <div key={s.$id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-fill/40 text-fg-2 dark:border-line-strong">
            {s.deviceName === 'smartphone' ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">
              {s.clientName || 'Browser'} on {s.osName || 'Unknown'}
              {s.current && <span className="ml-2 rounded-md bg-[rgba(16,185,129,0.12)] px-1.5 py-px text-[11px] font-medium text-success">This device</span>}
            </div>
            <div className="truncate text-[12px] text-fg-3">
              {[s.countryName, s.ip, `signed in ${relativeTime(s.$createdAt)}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          {!s.current && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={async () => {
                await account.deleteSession({ sessionId: s.$id });
                sessions.refetch();
              }}
            >
              Sign out
            </Button>
          )}
        </div>
      ))}

      <Sheet open={!!setup} onClose={() => setSetup(null)} className="max-w-md">
        {setup && (
          <div className="p-6 text-center">
            <h2 className="font-display font-bold text-[20px] tracking-[-0.01em]">Scan with your authenticator</h2>
            <p className="mt-1 text-[13.5px] text-fg-2">Use 1Password, Google Authenticator or the Passwords app.</p>
            <img src={qrUrl(setup.uri, 400)} alt="Authenticator QR code" width={200} height={200} className="mx-auto mt-5 rounded-lg bg-white p-2" />
            <div className="mt-3 break-all font-mono text-[12px] text-fg-3">{setup.secret}</div>
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="mt-5 h-12 text-center font-mono text-[22px] tracking-[0.35em]"
            />
            <Button variant="primary" className="mt-4 w-full" size="lg" loading={busy} disabled={otp.length < 6} onClick={verifyMfa}>
              Verify & turn on
            </Button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!codes} onClose={() => setCodes(null)} className="max-w-md">
        <div className="p-6">
          <h2 className="font-display font-bold text-[20px] tracking-[-0.01em]">Save your recovery codes</h2>
          <p className="mt-1 text-[13.5px] text-fg-2">Each code signs you in once if you lose your authenticator.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-sunken p-4 font-mono text-[13.5px] dark:border-line-strong/60">
            {codes?.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(codes?.join('\n') || '');
                toast({ title: 'Codes copied', tone: 'success' });
              }}
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setCodes(null)}>
              Done
            </Button>
          </div>
        </div>
      </Sheet>
    </Group>
  );
}

type ApiKeyRow = Models.Row & { name: string; prefix: string; scopes: string[]; lastUsedAt: string | null };

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-fill py-1.5 pl-3 pr-1.5">
      <code className={cx('min-w-0 flex-1 truncate text-[13px]', mono ? 'font-mono' : '')}>{value}</code>
      <IconButton
        label={copied ? 'Copied' : 'Copy'}
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </IconButton>
    </div>
  );
}

function DeveloperSection() {
  const { user } = useMail();
  const keys = useQuery({
    queryKey: ['apikeys', user.$id],
    queryFn: async () =>
      (
        await tablesDB.listRows<ApiKeyRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.apikeys,
          queries: [Query.equal('ownerId', user.$id), Query.orderDesc('$createdAt'), Query.limit(50)],
        })
      ).rows,
  });
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(API_SCOPES.map(([s]) => s));
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await callApi<{ secret: string }>('POST', '/keys', { name: name.trim() || 'API key', scopes });
      setSecret(res.secret);
      setName('');
      keys.refetch();
    } catch (err: any) {
      toast({ title: 'Could not create key', description: err.message, tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Group
        id="developer"
        title="MCP server"
        footer={
          <>
            Connect Claude, ChatGPT, Cursor or VS Code to your mailbox. You sign in and approve access once; nothing to copy. See the{' '}
            <a href="/developers" className="text-accent">
              developer docs
            </a>
            .
          </>
        }
      >
        <div className="space-y-3 px-4 py-3.5">
          <CopyField value={MCP_URL} />
          <div className="flex flex-wrap gap-2">
            <a href={INSTALL.cursor} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fill px-3 text-[13px] font-medium text-fg hover:bg-fill-2">
              Add to Cursor
            </a>
            <a href={INSTALL.vscode} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fill px-3 text-[13px] font-medium text-fg hover:bg-fill-2">
              Add to VS Code
            </a>
            <a
              href="https://claude.ai/settings/connectors"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fill px-3 text-[13px] font-medium text-fg hover:bg-fill-2"
            >
              Add to Claude <ExternalLink className="h-3.5 w-3.5 text-fg-3" />
            </a>
          </div>
        </div>
      </Group>

      <Group id="apikeys" title="API keys" footer={<>For scripts and servers calling {API_URL}. A key acts as you with the permissions you pick.</>}>
        {secret && (
          <div className="space-y-2 bg-accent-soft px-4 py-3.5">
            <div className="text-[13.5px] font-medium">Copy your new key now. It won’t be shown again.</div>
            <CopyField value={secret} />
            <button className="text-[13px] font-medium text-accent" onClick={() => setSecret('')}>
              Done
            </button>
          </div>
        )}
        {(keys.data || []).map((k) => (
          <Item
            key={k.$id}
            label={
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-fg-3" /> {k.name}
                <code className="font-mono text-[12px] text-fg-3">{k.prefix}…</code>
              </span>
            }
            hint={`${(k.scopes || []).join(', ')} · ${k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : `created ${relativeTime(k.$createdAt)}`}`}
          >
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={async () => {
                await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.apikeys, rowId: k.$id });
                keys.refetch();
                toast({ title: 'Key revoked', tone: 'success' });
              }}
            >
              Revoke
            </Button>
          </Item>
        ))}
        <form onSubmit={create} className="space-y-3 px-4 py-3.5">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, like “Zapier”" className="flex-1" maxLength={64} />
            <Button type="submit" variant="primary" loading={creating} disabled={!scopes.length}>
              Create key
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {API_SCOPES.map(([scope, label]) => (
              <label key={scope} className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(e) => setScopes((s) => (e.target.checked ? [...s, scope] : s.filter((x) => x !== scope)))}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span title={label}>{scope}</span>
              </label>
            ))}
          </div>
        </form>
      </Group>
    </>
  );
}

function DangerSection() {
  const navigate = useNavigate();
  const { mailbox } = useMail();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Group id="danger" title="Danger zone">
      <Item label="Sign out everywhere" hint="End every session, including this one.">
        <Button
          size="sm"
          onClick={async () => {
            await signOut(true);
            navigate({ to: '/login' });
          }}
        >
          Sign out all
        </Button>
      </Item>
      <Item label={<span className="text-danger">Delete account</span>} hint="Permanently deletes your address, mail, attachments and contacts.">
        <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
          Delete
        </Button>
      </Item>
      <Sheet open={open} onClose={() => setOpen(false)} className="max-w-md">
        <div className="p-6">
          <h2 className="font-display font-bold text-[20px] tracking-[-0.01em]">Delete your account?</h2>
          <p className="mt-2 text-[14px] text-fg-2">
            This removes <b className="text-fg">{mailbox.handle}</b> and everything in it. Type your address handle to confirm.
          </p>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={mailbox.handle} className="mt-4" />
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirm !== mailbox.handle}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await callApi('POST', '/account/delete');
                  forgetDevice();
                  navigate({ to: '/' });
                } catch (e: any) {
                  toast({ title: 'Could not delete account', description: e.message, tone: 'error' });
                  setBusy(false);
                }
              }}
            >
              Delete forever
            </Button>
          </div>
        </div>
      </Sheet>
    </Group>
  );
}
