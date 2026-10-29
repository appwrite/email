import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Check, Copy, KeyRound, Lock, Plug, Terminal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SoftLights } from '~/components/AuthLayout';
import { APP_NAME, AppwriteLogotype, EmailLockup } from '~/components/brand';
import { cx } from '~/components/ui';
import { ENDPOINT, PROJECT_ID } from '~/lib/appwrite';
import { API_SCOPES, API_URL, INSTALL, MCP_URL, OPENAPI_URL } from '~/lib/developer';

export const Route = createFileRoute('/developers')({
  head: () => ({
    meta: [
      { title: `Developers — ${APP_NAME}` },
      { name: 'description', content: 'Connect AI assistants to your inbox with the remote MCP server, or build on the REST API with OAuth 2.1.' },
    ],
  }),
  component: Developers,
});

const ISSUER = `${ENDPOINT}/oauth2/${PROJECT_ID}`;
const REPO_URL = 'https://github.com/appwrite/email';

const TOOLS: [string, string, string][] = [
  ['get_mailbox', 'mail.read', 'Your address, name and inbox counts'],
  ['list_messages', 'mail.read', 'List or full-text search any folder'],
  ['read_message', 'mail.read', 'Full message with attachment links'],
  ['read_thread', 'mail.read', 'A whole conversation, oldest first'],
  ['list_labels', 'mail.read', 'Your labels and their IDs'],
  ['send_email', 'mail.send', 'Send a new message from your address'],
  ['reply_to_email', 'mail.send', 'Reply in the same conversation'],
  ['update_messages', 'mail.modify', 'Read, star, label, archive, move, trash'],
];

const ENDPOINTS: [string, string, string, string][] = [
  ['GET', '/v1/me', 'mail.read', 'Your mailbox'],
  ['GET', '/v1/messages', 'mail.read', 'List or search: folder, q, unread, starred, label, limit, cursor'],
  ['GET', '/v1/messages/{id}', 'mail.read', 'One message; ?html=true adds the HTML body'],
  ['GET', '/v1/threads/{id}', 'mail.read', 'A conversation'],
  ['GET', '/v1/labels', 'mail.read', 'Your labels'],
  ['POST', '/v1/messages', 'mail.send', 'Send: to, cc, bcc, subject, text or html; replyTo for replies'],
  ['PATCH', '/v1/messages/{id}', 'mail.modify', 'Update: read, starred, folder, addLabels, removeLabels'],
  ['PATCH', '/v1/messages', 'mail.modify', 'Update many: same fields plus ids'],
  ['DELETE', '/v1/messages/{id}', 'mail.modify', 'Move to Trash'],
];

const METHOD_TINT: Record<string, string> = { GET: '#007aff', POST: '#34c759', PATCH: '#ff9f0a', DELETE: '#ff3b30' };

function CopyLine({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cx('flex items-center gap-2 rounded-xl bg-fill py-2 pl-4 pr-2', className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-fg">{value}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy"
        className="icon-hover flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-fill-2 hover:text-fg"
      >
        <span className="icon-anim">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}</span>
      </button>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl bg-[#1d1d1f] p-5 font-mono text-[13px] leading-[1.75] text-[#f5f5f7]">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 py-14 sm:py-20">
      <p className="mb-2 text-[15px] font-semibold text-accent">{eyebrow}</p>
      <h2 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-fg sm:text-[40px]">{title}</h2>
      <div className="mt-6 space-y-5 text-[16px] leading-relaxed text-fg-2">{children}</div>
    </section>
  );
}

const pill = 'inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[14.5px] font-medium transition';

function Developers() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <header className="vibrancy sticky top-0 z-50 border-b border-line/70 bg-[color-mix(in_srgb,var(--bg)_78%,transparent)]">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" aria-label={`${APP_NAME} home`}>
            <EmailLockup size={22} />
          </Link>
          <span className="text-[13px] font-medium text-fg-2">Developers</span>
          <nav className="ml-auto hidden items-center gap-6 text-[12.5px] text-fg-2 sm:flex">
            {[
              ['#mcp', 'MCP'],
              ['#auth', 'Authentication'],
              ['#api', 'REST API'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="hover:text-fg">
                {label}
              </a>
            ))}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden">
        <SoftLights />
        <div className="mx-auto max-w-5xl px-4 pb-10 pt-16 sm:px-6 sm:pt-24">
          <p className="mb-3 text-[15px] font-semibold text-accent">API and MCP</p>
          <h1 className="text-gradient-brand max-w-3xl font-display text-[48px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[68px]">
            Your inbox, programmable.
          </h1>
          <p className="mt-6 max-w-2xl text-[19px] leading-relaxed text-fg-2">
            Let AI assistants read, search, triage and reply to your email through a remote MCP server, or build on the REST API. Both sign in with
            OAuth 2.1, so nobody handles a password or pastes a token.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#mcp" className={cx(pill, 'bg-accent text-white hover:brightness-110')}>
              <Plug className="h-4 w-4" /> Connect an assistant
            </a>
            <a href={OPENAPI_URL} target="_blank" rel="noreferrer" className={cx(pill, 'bg-fill text-fg hover:bg-fill-2')}>
              OpenAPI spec <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl divide-y divide-line px-4 sm:px-6">
        <Section id="mcp" eyebrow="MCP server" title="One click to connect.">
          <p>
            Add this URL to any MCP client that supports remote servers. The first time it connects, you sign in to {APP_NAME} and choose what it
            may do. The client registers itself, so there are no keys to create.
          </p>
          <CopyLine value={MCP_URL} />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: 'Claude', how: 'Settings → Connectors → Add custom connector, then paste the URL.', href: 'https://claude.ai/settings/connectors', cta: 'Open Claude' },
              { name: 'ChatGPT', how: 'Settings → Apps & Connectors → Create, then paste the URL.', href: 'https://chatgpt.com/#settings/Connectors', cta: 'Open ChatGPT' },
              { name: 'Cursor', how: 'Installs the server and opens sign-in on first use.', href: INSTALL.cursor, cta: 'Add to Cursor' },
              { name: 'VS Code', how: 'Adds the server to your MCP settings.', href: INSTALL.vscode, cta: 'Add to VS Code' },
            ].map((c) => (
              <div key={c.name} className="flex flex-col rounded-2xl bg-sunken p-5">
                <div className="text-[17px] font-semibold text-fg">{c.name}</div>
                <p className="mt-1 flex-1 text-[14px] leading-relaxed">{c.how}</p>
                <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[14.5px] font-medium text-accent hover:underline">
                  {c.cta} <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-2">
            <Terminal className="h-4 w-4 shrink-0 text-fg-3" /> Claude Code:
          </p>
          <CopyLine value={INSTALL.claudeCode} />
          <div className="overflow-hidden rounded-2xl shadow-[0_0_0_0.5px_var(--line-strong)]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-fill text-[12.5px] text-fg-2">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">Scope</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">What it does</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {TOOLS.map(([name, scope, what]) => (
                  <tr key={name}>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-fg">{name}</td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px]">{scope}</td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="auth" eyebrow="Authentication" title="OAuth 2.1, or a personal key.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-sunken p-6">
              <Lock className="h-6 w-6 text-accent" strokeWidth={1.75} />
              <h3 className="mt-3 text-[17px] font-semibold text-fg">OAuth 2.1 for apps</h3>
              <p className="mt-1.5 text-[14.5px]">
                The authorization server is an Appwrite project: authorization code with PKCE, dynamic client registration, refresh token rotation and
                resource indicators. Point any OAuth library at the discovery document.
              </p>
            </div>
            <div className="rounded-2xl bg-sunken p-6">
              <KeyRound className="h-6 w-6 text-accent" strokeWidth={1.75} />
              <h3 className="mt-3 text-[17px] font-semibold text-fg">API keys for scripts</h3>
              <p className="mt-1.5 text-[14.5px]">
                Create a key in{' '}
                <Link to="/mail/settings" className="text-accent">
                  Settings → API keys
                </Link>{' '}
                with just the permissions it needs, and send it as a bearer token. Revoke it any time.
              </p>
            </div>
          </div>
          <p>Discovery document:</p>
          <CopyLine value={`${ISSUER}/.well-known/openid-configuration`} />
          <div className="overflow-hidden rounded-2xl shadow-[0_0_0_0.5px_var(--line-strong)]">
            {API_SCOPES.map(([scope, label], i) => (
              <div key={scope} className={cx('flex items-center gap-4 px-4 py-3', i > 0 && 'border-t border-line')}>
                <code className="w-28 shrink-0 font-mono text-[13px] text-fg">{scope}</code>
                <span className="text-[14.5px]">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="api" eyebrow="REST API" title="Simple, JSON, predictable.">
          <p>
            Base URL <code className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[14px] text-fg">{API_URL}</code>. Every request sends{' '}
            <code className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[14px] text-fg">Authorization: Bearer &lt;token&gt;</code>. Errors return a
            JSON <code className="font-mono text-[14px]">message</code> with a 4xx status.
          </p>
          <div className="overflow-hidden rounded-2xl shadow-[0_0_0_0.5px_var(--line-strong)]">
            {ENDPOINTS.map(([method, path, scope, what], i) => (
              <div key={method + path} className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3', i > 0 && 'border-t border-line')}>
                <span className="w-14 font-mono text-[12px] font-semibold" style={{ color: METHOD_TINT[method] }}>
                  {method}
                </span>
                <code className="font-mono text-[13.5px] text-fg">{path}</code>
                <span className="ml-auto font-mono text-[12px] text-fg-3">{scope}</span>
                <span className="w-full pl-[72px] text-[13.5px]">{what}</span>
              </div>
            ))}
          </div>
          <p>Search your inbox:</p>
          <Code>{`curl "${API_URL}/v1/messages?q=invoice&unread=true" \\
  -H "Authorization: Bearer $MAIL_KEY"`}</Code>
          <p>Send a message:</p>
          <Code>{`curl -X POST "${API_URL}/v1/messages" \\
  -H "Authorization: Bearer $MAIL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": ["ada@example.com"], "subject": "Hello", "text": "Sent from the API."}'`}</Code>
          <p>Archive and mark read:</p>
          <Code>{`curl -X PATCH "${API_URL}/v1/messages/<id>" \\
  -H "Authorization: Bearer $MAIL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"folder": "archive", "read": true}'`}</Code>
        </Section>
      </main>

      <footer className="bg-sunken">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-[12px] text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <EmailLockup size={18} />
          <a href="https://appwrite.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-fg">
            Open source · Runs on <AppwriteLogotype className="h-[15px] text-fg" />
          </a>
        </div>
      </footer>
    </div>
  );
}
