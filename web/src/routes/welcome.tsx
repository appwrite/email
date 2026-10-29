import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AuthLayout, FormError } from '~/components/AuthLayout';
import { Button, Field, Input, Spinner, cx } from '~/components/ui';
import { takeAfterAuth } from '~/lib/session';
import { callApi } from '~/lib/api';
import { MAIL_DOMAIN, type MailboxRow } from '~/lib/appwrite';
import { fetchAccount, fetchMailbox, queryClient } from '~/lib/queries';

export const Route = createFileRoute('/welcome')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Choose your address — Mail' }] }),
  component: Welcome,
});

type Availability = { available: boolean; reason: string | null; address: string };

function suggestions(name: string) {
  const parts = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return [];
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  const list = [last ? `${first}.${last}` : first, last ? `${first}${last}` : `${first}.mail`, first, last ? `${first[0]}${last}` : `hey.${first}`];
  return [...new Set(list)].filter((s) => s.length >= 2).slice(0, 4);
}

function Welcome() {
  const navigate = useNavigate();
  const [uid, setUid] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [check, setCheck] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<MailboxRow | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAccount().then(async (user) => {
      if (!user) return navigate({ to: '/login', replace: true });
      const mailbox = await fetchMailbox(user.$id);
      if (mailbox) {
        const next = takeAfterAuth();
        return next ? window.location.replace(next) : navigate({ to: '/mail/$folder', params: { folder: 'inbox' }, replace: true });
      }
      setUid(user.$id);
      setName(user.name);
      setHandle((h) => h || suggestions(user.name)[0] || '');
    });
  }, [navigate]);

  useEffect(() => {
    if (!handle || !uid) {
      setCheck(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      callApi<Availability>('GET', `/mailbox/available?handle=${encodeURIComponent(handle)}`)
        .then(setCheck)
        .catch(() => setCheck(null))
        .finally(() => setChecking(false));
    }, 300);
    return () => clearTimeout(t);
  }, [handle, uid]);

  const ideas = useMemo(() => suggestions(name), [name]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const mailbox = await callApi<MailboxRow>('POST', '/mailbox', { handle, name });
      queryClient.setQueryData(['mailbox', uid], mailbox);
      queryClient.invalidateQueries({ queryKey: ['account'] });
      setDone(mailbox);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="You’re all set" subtitle="Your new address is live. Send it a hello from any email account.">
        <div>
          <div className="mb-5 rounded-lg border border-line bg-sunken p-4 font-mono text-[13px] leading-relaxed break-all text-fg dark:border-line-strong/60">{done.address}</div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(done.address);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                const next = takeAfterAuth();
                if (next) window.location.assign(next);
                else navigate({ to: '/mail/$folder', params: { folder: 'inbox' } });
              }}
            >
              Open Inbox
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const valid = check?.available;
  return (
    <AuthLayout title="Choose your address" subtitle="This is where your mail will arrive.">
      {!uid ? (
        <div className="flex justify-center py-10">
          <Spinner className="text-fg-3" />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError>{error}</FormError>
          <Field label="Your name" hint="Shown to people you email.">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Address">
            <div
              className={cx(
                'flex h-9 items-center overflow-hidden rounded-md border bg-transparent transition-[border,box-shadow] focus-within:border-fg-3 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--fg-3)_22%,transparent)] dark:bg-fill/50',
                check && !check.available ? 'border-danger' : 'border-line dark:border-line-strong',
              )}
            >
              <input
                autoFocus
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                maxLength={32}
                className="h-full min-w-0 flex-1 bg-transparent pl-3 font-mono text-[13.5px] outline-none"
                placeholder="your.name"
                spellCheck={false}
              />
              <span className="flex h-full items-center pr-3 text-fg-3">
                {checking ? <Spinner size={16} /> : valid ? <Check className="h-4 w-4 text-success" /> : check ? <X className="h-4 w-4 text-danger" /> : null}
              </span>
            </div>
          </Field>
          {ideas.length > 0 && (
            <div className="-mt-1 flex flex-wrap gap-1.5">
              {ideas.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setHandle(s)}
                  className={cx('h-7 rounded-md border px-2.5 font-mono text-[12px] transition', s === handle ? 'border-fg-3 bg-fill-2 text-fg' : 'border-line text-fg-2 hover:bg-fill dark:border-line-strong')}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-line bg-sunken p-4 dark:border-line-strong/60">
            <div className="eyebrow no-mark mb-1.5 text-[11.5px] text-fg-3">Your address</div>
            <div className="font-mono text-[13.5px] leading-relaxed break-all">
              <span className="font-semibold text-fg">{handle || 'your.name'}</span>
              <span className="text-fg-2">
                @{MAIL_DOMAIN}
              </span>
            </div>
            <AnimatePresence>
              {check?.reason && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 text-[13px] text-danger">
                  {check.reason}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={saving} disabled={!valid || checking}>
            Claim address
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
