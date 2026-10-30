import { Link, createFileRoute } from '@tanstack/react-router';
import { Apps, Oauth2, type Models } from 'appwrite';
import { ArrowLeftRight, Eye, Mail, Pencil, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthLayout, FormError } from '~/components/AuthLayout';
import { EmailMark } from '~/components/brand';
import { Button, Spinner, Switch, cx } from '~/components/ui';
import { client } from '~/lib/appwrite';
import { fetchAccount } from '~/lib/queries';
import { setAfterAuth, signOut } from '~/lib/session';
import { useBrand } from '~/lib/brand';

export const Route = createFileRoute('/oauth/consent')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Allow access — Mail' }] }),
  component: Consent,
});

const oauth2 = new Oauth2(client);
const apps = new Apps(client);

// Plain-language scope descriptions. Identity scopes are always granted.
const SCOPES: Record<string, { label: string; detail: string; icon: typeof Mail; write?: boolean }> = {
  'mail.read': { label: 'Read your email', detail: 'Messages, conversations, labels and attachments.', icon: Eye },
  'mail.send': { label: 'Send email as you', detail: 'New messages and replies from your address.', icon: Send, write: true },
  'mail.modify': { label: 'Organize your email', detail: 'Mark read, star, label, archive, move and delete.', icon: Pencil, write: true },
};
const IDENTITY = new Set(['openid', 'profile', 'email', 'phone', 'offline_access']);

type State =
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'ready'; grant: Models.Oauth2Grant; app: Models.App | null; user: Models.User<Models.Preferences> };

function Consent() {
  const [state, setState] = useState<State>({ step: 'loading' });
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState('');
  const brand = useBrand();

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const user = await fetchAccount();
      if (!user) {
        // Come back here, with the same parameters, after signing in.
        setAfterAuth(window.location.pathname + window.location.search);
        window.location.replace('/login');
        return;
      }
      let grantId = params.get('grant_id');
      if (!grantId) {
        const result = await oauth2.authorize({
          clientId: params.get('client_id') || '',
          redirectUri: params.get('redirect_uri') || '',
          responseType: params.get('response_type') || 'code',
          scope: params.get('scope') || undefined,
          state: params.get('state') || undefined,
          nonce: params.get('nonce') || undefined,
          codeChallenge: params.get('code_challenge') || undefined,
          codeChallengeMethod: params.get('code_challenge_method') || undefined,
          prompt: params.get('prompt') || undefined,
          resource: params.getAll('resource').length ? params.getAll('resource') : undefined,
          requestUri: params.get('request_uri') || undefined,
          authorizationDetails: params.get('authorization_details') || undefined,
        });
        if (result.redirectUrl) return window.location.replace(result.redirectUrl);
        grantId = result.grantId;
      }
      const grant = await oauth2.getGrant({ grantId: grantId! });
      const app = await apps.get({ appId: grant.appId }).catch(() => null);
      setEnabled(Object.fromEntries(grant.scopes.filter((s) => SCOPES[s]).map((s) => [s, true])));
      setState({ step: 'ready', grant, app, user });
    })().catch((e) => setState({ step: 'error', message: e.message || 'This sign-in request is no longer valid.' }));
  }, []);

  if (state.step === 'loading') {
    return (
      <AuthLayout title="Allow access">
        <div className="flex justify-center py-10">
          <Spinner className="text-fg-3" />
        </div>
      </AuthLayout>
    );
  }

  if (state.step === 'error') {
    return (
      <AuthLayout title="Something went wrong" subtitle="Start the connection again from the app that sent you here.">
        <FormError>{state.message}</FormError>
        <Link to="/mail/$folder" params={{ folder: 'inbox' }} className="text-[14px] font-medium text-accent">
          Go to your inbox
        </Link>
      </AuthLayout>
    );
  }

  const { grant, app, user } = state;
  const name = app?.name || 'This app';
  const requested = grant.scopes.filter((s) => SCOPES[s]);
  const kept = requested.filter((s) => enabled[s]);
  const host = (() => {
    try {
      return new URL(grant.redirectUri).host;
    } catch {
      return grant.redirectUri;
    }
  })();

  async function decide(allow: boolean) {
    setError('');
    setBusy(allow ? 'allow' : 'deny');
    try {
      const result = allow
        ? await oauth2.approve({ grantId: grant.$id, scope: [...grant.scopes.filter((s) => IDENTITY.has(s)), ...kept].join(' ') })
        : await oauth2.reject({ grantId: grant.$id });
      window.location.assign(result.redirectUrl);
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <AuthLayout title={`Allow ${name}?`} subtitle={<>{name} wants to use your {brand.name} account.</>}>
      <FormError>{error}</FormError>
      <div className="mb-6 flex items-center justify-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[15px] bg-fill text-fg-2 shadow-[0_0_0_0.5px_var(--line-strong)]">
          {app?.logoUri ? <img src={app.logoUri} alt="" className="h-full w-full object-cover" /> : <span className="text-[22px] font-semibold">{name[0]}</span>}
        </span>
        <ArrowLeftRight className="h-4 w-4 text-fg-3" />
        <EmailMark size={56} />
      </div>

      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-fill px-3.5 py-2.5 text-[13px]">
        <span className="min-w-0 truncate text-fg-2">
          Signed in as <span className="font-medium text-fg">{user.email}</span>
        </span>
        <button
          className="shrink-0 font-medium text-accent"
          onClick={async () => {
            setAfterAuth(window.location.pathname + window.location.search);
            await signOut();
            window.location.assign('/login');
          }}
        >
          Switch
        </button>
      </div>

      {requested.length > 0 && (
        <ul className="mb-5 divide-y divide-line overflow-hidden rounded-xl shadow-[0_0_0_0.5px_var(--line-strong)]">
          {requested.map((s) => {
            const info = SCOPES[s];
            return (
              <li key={s} className="flex items-center gap-3 px-3.5 py-3">
                <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', info.write ? 'bg-[rgba(255,149,0,0.14)] text-[#ff9500]' : 'bg-accent-soft text-accent')}>
                  <info.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-fg">{info.label}</div>
                  <div className="text-[12.5px] leading-snug text-fg-2">{info.detail}</div>
                </div>
                <Switch checked={!!enabled[s]} onChange={(v) => setEnabled((e) => ({ ...e, [s]: v }))} label={info.label} />
              </li>
            );
          })}
        </ul>
      )}

      <p className="mb-5 flex gap-2 text-[12.5px] leading-relaxed text-fg-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span>
          You’ll return to <span className="font-medium text-fg">{host}</span>. You can turn off access at any time in Settings.
        </span>
      </p>

      <div className="flex gap-2">
        <Button className="flex-1" size="lg" onClick={() => decide(false)} loading={busy === 'deny'} disabled={!!busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          size="lg"
          onClick={() => decide(true)}
          loading={busy === 'allow'}
          disabled={!!busy || (requested.length > 0 && kept.length === 0)}
        >
          Allow
        </Button>
      </div>
    </AuthLayout>
  );
}
