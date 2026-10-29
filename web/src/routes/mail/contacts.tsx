import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Query } from 'appwrite';
import { ArrowLeft, Mail, Menu, Plus, Search, Star, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Empty, Field, IconButton, Input, Sheet, cx } from '~/components/ui';
import { DATABASE_ID, TABLES, tablesDB, type ContactRow, type MessageRow } from '~/lib/appwrite';
import { compose } from '~/lib/actions';
import { displayName, formatAddress, isEmail, listDate, sha1Hex } from '~/lib/format';
import { useMail } from '~/lib/mail-context';
import { ownerPerms, queryClient, useContacts, useSettings } from '~/lib/queries';
import { toast, uiStore } from '~/lib/store';

export const Route = createFileRoute('/mail/contacts')({
  ssr: false,
  component: Contacts,
});

function Contacts() {
  const { user } = useMail();
  const contacts = useContacts(user.$id);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (contacts.data || [])
      .filter((c) => !term || c.email.includes(term) || (c.name || '').toLowerCase().includes(term) || (c.company || '').toLowerCase().includes(term))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [contacts.data, q]);
  const favorites = list.filter((c) => c.favorite);
  const groups = useMemo(() => {
    const map = new Map<string, ContactRow[]>();
    for (const c of list) {
      const letter = displayName(c)[0]?.toUpperCase() || '#';
      const key = /[A-Z]/.test(letter) ? letter : '#';
      map.set(key, [...(map.get(key) || []), c]);
    }
    return [...map.entries()];
  }, [list]);
  const current = (contacts.data || []).find((c) => c.$id === selected);

  return (
    <div className="flex min-w-0 flex-1">
      <section className={cx('relative flex w-full shrink-0 flex-col border-r border-line bg-surface lg:w-[340px]', current && 'max-lg:hidden')}>
        <header className="shrink-0 border-b border-line bg-chrome">
          <div className="flex h-[52px] items-center gap-1 px-3">
            <IconButton label="Mailboxes" className="md:hidden" onClick={() => uiStore.set({ sidebarOpen: true })}>
              <Menu className="h-5 w-5" />
            </IconButton>
            <div className="flex-1 pl-1">
              <h1 className="font-display font-bold text-[19px] leading-tight tracking-[-0.01em]">Contacts</h1>
              <div className="text-[11.5px] leading-tight text-fg-3">{contacts.data?.length || 0} people</div>
            </div>
            <IconButton label="New contact" onClick={() => setAdding(true)}>
              <Plus className="h-5 w-5" />
            </IconButton>
          </div>
          <div className="px-3 pb-2.5">
            <div className="flex h-8 items-center gap-2 rounded-md border border-line px-2.5 focus-within:border-fg-3 dark:border-line-strong dark:bg-fill/50">
              <Search className="h-3.5 w-3.5 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3" />
            </div>
          </div>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto pb-10">
          {!list.length && !contacts.isLoading ? (
            <Empty overlay icon={<Users />} title="No contacts yet">
              People you email are added automatically.
            </Empty>
          ) : (
            <>
              {favorites.length > 0 && !q && (
                <div className="flex gap-3 overflow-x-auto px-4 py-3">
                  {favorites.map((c) => (
                    <button key={c.$id} onClick={() => setSelected(c.$id)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                      <Avatar name={displayName(c)} email={c.email} size={52} />
                      <span className="w-full truncate text-center text-[11.5px]">{displayName(c).split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              )}
              {groups.map(([letter, items]) => (
                <div key={letter}>
                  <div className="sticky top-0 z-[1] bg-surface/90 px-4 py-1 text-[12px] font-semibold text-fg-3 backdrop-blur">{letter}</div>
                  {items.map((c) => (
                    <button
                      key={c.$id}
                      onClick={() => setSelected(c.$id)}
                      className={cx('mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-md px-2 py-2 text-left', selected === c.$id ? 'bg-selected' : 'hover:bg-fill')}
                    >
                      <Avatar name={displayName(c)} email={c.email} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{displayName(c)}</div>
                        <div className="truncate text-[11px] text-fg-3">{c.email}</div>
                      </div>
                      {c.favorite && <Star className="h-3.5 w-3.5 fill-current text-warning" />}
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </section>
      <section className={cx('min-w-0 flex-1 bg-bg', !current && 'hidden lg:block')}>
        {current ? <ContactDetail key={current.$id} contact={current} onBack={() => setSelected(null)} /> : <Empty icon={<Users />} title="Select a contact" />}
      </section>
      <NewContact open={adding} onClose={() => setAdding(false)} onCreated={(id) => setSelected(id)} />
    </div>
  );
}

function ContactDetail({ contact, onBack }: { contact: ContactRow; onBack: () => void }) {
  const { user } = useMail();
  const navigate = useNavigate();
  const settings = useSettings(user.$id).data;
  const [form, setForm] = useState({ name: contact.name || '', company: contact.company || '', phone: contact.phone || '', notes: contact.notes || '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ name: contact.name || '', company: contact.company || '', phone: contact.phone || '', notes: contact.notes || '' }), [contact]);
  const changed = form.name !== (contact.name || '') || form.company !== (contact.company || '') || form.phone !== (contact.phone || '') || form.notes !== (contact.notes || '');

  const recent = useQuery({
    queryKey: ['contact-messages', contact.email],
    queryFn: async () =>
      (
        await tablesDB.listRows<MessageRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.messages,
          queries: [
            Query.equal('ownerId', user.$id),
            Query.or([Query.equal('fromEmail', contact.email), Query.contains('to', [contact.email])]),
            Query.select(['subject', 'date', 'folder', 'snippet', 'fromEmail']),
            Query.orderDesc('date'),
            Query.limit(8),
          ],
          total: false,
        })
      ).rows,
  });

  const save = async (data: Partial<ContactRow>) => {
    setSaving(true);
    try {
      await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.contacts, rowId: contact.$id, data });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="flex h-[52px] items-center px-2 lg:hidden">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
      </div>
      <div className="mx-auto max-w-xl px-6 pb-20 pt-10">
        <div className="flex flex-col items-center text-center">
          <Avatar name={displayName(contact)} email={contact.email} size={96} />
          <h2 className="mt-4 font-display font-bold text-[30px] leading-tight tracking-[-0.02em]">{displayName(contact)}</h2>
          <div className="text-[14px] text-fg-2">{contact.company || contact.email}</div>
          <div className="mt-5 flex gap-3">
            {[
              {
                label: 'Mail',
                icon: Mail,
                run: () => compose(settings?.signature, { to: [formatAddress({ name: contact.name, email: contact.email })], focus: 'body' }),
              },
              { label: contact.favorite ? 'Favorite' : 'Add Favorite', icon: Star, run: () => save({ favorite: !contact.favorite }) },
              {
                label: 'Delete',
                icon: Trash2,
                run: async () => {
                  await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.contacts, rowId: contact.$id });
                  queryClient.invalidateQueries({ queryKey: ['contacts'] });
                  onBack();
                },
              },
            ].map(({ label, icon: Icon, run }) => (
              <button key={label} onClick={run} className="flex w-[84px] flex-col items-center gap-1 rounded-lg border border-line bg-card py-2.5 text-fg-2 transition hover:bg-fill hover:text-fg dark:border-line-strong/60">
                <Icon className={cx('h-5 w-5', label === 'Favorite' && 'fill-accent text-accent')} />
                <span className="text-[11.5px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card dark:divide-line-strong/60 dark:border-line-strong/60">
          <Row label="email">
            <span className="text-accent">{contact.email}</span>
          </Row>
          {(['name', 'company', 'phone'] as const).map((k) => (
            <Row key={k} label={k}>
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder="Add" className="w-full bg-transparent outline-none placeholder:text-fg-3" />
            </Row>
          ))}
          <Row label="notes">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Add notes" className="w-full resize-none bg-transparent outline-none placeholder:text-fg-3" />
          </Row>
        </div>
        {changed && (
          <div className="mt-3 flex justify-end">
            <Button variant="primary" loading={saving} onClick={() => save(form).then(() => toast({ title: 'Contact saved', tone: 'success' }))}>
              Save changes
            </Button>
          </div>
        )}

        <h3 className="eyebrow no-mark mb-2.5 mt-10 px-1 text-[11.5px] text-fg-3">Recent conversations</h3>
        <div className="overflow-hidden rounded-xl border border-line bg-card dark:border-line-strong/60">
          {(recent.data || []).length === 0 ? (
            <div className="px-4 py-6 text-center text-[13.5px] text-fg-3">{recent.isLoading ? 'Loading…' : 'No messages yet'}</div>
          ) : (
            recent.data!.map((m) => (
              <button
                key={m.$id}
                onClick={() => navigate({ to: '/mail/$folder', params: { folder: m.folder }, search: { m: m.$id } })}
                className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-fill"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{m.subject || '(no subject)'}</div>
                  <div className="truncate text-[12.5px] text-fg-2">{m.snippet}</div>
                </div>
                <span className="text-[12px] text-fg-3">{listDate(m.date)}</span>
              </button>
            ))
          )}
        </div>
        {contact.timesContacted > 0 && (
          <p className="mt-3 px-1 text-[12px] text-fg-3">
            You’ve emailed {displayName(contact).split(' ')[0]} {contact.timesContacted} {contact.timesContacted === 1 ? 'time' : 'times'}.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-3 text-[14.5px]">
      <span className="w-20 shrink-0 text-[13px] capitalize text-fg-3">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function NewContact({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useMail();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} className="max-w-md">
      <form
        className="p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!isEmail(email)) return toast({ title: 'Enter a valid email address', tone: 'error' });
          setSaving(true);
          try {
            const normalized = email.trim().toLowerCase();
            const rowId = 'c' + (await sha1Hex(`${user.$id}:${normalized}`)).slice(0, 32);
            await tablesDB.upsertRow({
              databaseId: DATABASE_ID,
              tableId: TABLES.contacts,
              rowId,
              data: { ownerId: user.$id, email: normalized, name: name.trim(), timesContacted: 0 },
              permissions: ownerPerms(user.$id),
            });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            onCreated(rowId);
            setName('');
            setEmail('');
            onClose();
          } catch (err: any) {
            toast({ title: 'Could not save contact', description: err.message, tone: 'error' });
          } finally {
            setSaving(false);
          }
        }}
      >
        <h2 className="mb-5 font-display font-bold text-[20px] tracking-[-0.01em]">New contact</h2>
        <div className="space-y-4">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Add contact
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
