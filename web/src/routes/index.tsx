import { Link, createFileRoute } from '@tanstack/react-router';
import { motion } from 'motion/react';
import {
  Archive,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Code2,
  Database,
  Download,
  EyeOff,
  FileText,
  Filter,
  Inbox,
  KeyRound,
  Lock,
  Mail,
  Paperclip,
  Search,
  Send,
  Server,
  ShieldAlert,
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { SoftLights } from '~/components/AuthLayout';
import { APP_NAME, AppwriteLogomark, AppwriteLogotype, EmailLockup, EmailMark } from '~/components/brand';
import { Kbd, cx } from '~/components/ui';
import { MAIL_DOMAIN } from '~/lib/appwrite';

export const Route = createFileRoute('/')({
  component: Landing,
});

const ease = [0.32, 0.72, 0, 1] as const;

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ eyebrow, children, sub, className }: { eyebrow?: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Reveal className={cx('mx-auto max-w-3xl text-center', className)}>
      {eyebrow && <p className="mb-3 text-[15px] font-semibold text-accent">{eyebrow}</p>}
      <h2 className="text-balance font-display text-[36px] font-bold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[52px]">{children}</h2>
      {sub && <p className="mx-auto mt-5 max-w-2xl text-pretty text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">{sub}</p>}
    </Reveal>
  );
}

const REPO_URL = 'https://github.com/appwrite/email';

const pill = 'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition';
const pillPrimary = cx(pill, 'bg-accent text-white hover:brightness-110');
const pillSecondary = cx(pill, 'text-accent hover:underline');

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="vibrancy sticky top-0 z-50 border-b border-line/70 bg-[color-mix(in_srgb,var(--bg)_78%,transparent)]">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link to="/" aria-label={`${APP_NAME} home`}>
          <EmailLockup size={22} />
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-7 text-[12.5px] text-fg-2 md:flex">
          {[
            ['#own', 'Open source'],
            ['#deploy', 'Self-host'],
            ['#features', 'Features'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden text-[12.5px] text-fg-2 transition hover:text-fg sm:inline">
            GitHub
          </a>
          <Link to="/login" className="hidden text-[12.5px] text-fg-2 transition hover:text-fg sm:inline">
            Sign in
          </Link>
          <Link to="/signup" className={cx(pillPrimary, 'h-7 px-3.5 text-[12.5px]')}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function TypedAddress() {
  const names = ['your.name', 'hello', 'ada', 'studio', 'grace.hopper', 'team'];
  const [i, setI] = useState(0);
  const [text, setText] = useState('your.name');
  useEffect(() => {
    const next = names[(i + 1) % names.length];
    let phase: 'delete' | 'type' = 'delete';
    const t = setInterval(() => {
      setText((s) => {
        if (phase === 'delete') {
          if (s.length === 0) {
            phase = 'type';
            return s;
          }
          return s.slice(0, -1);
        }
        if (s.length >= next.length) {
          clearInterval(t);
          setTimeout(() => setI((x) => x + 1), 1800);
          return s;
        }
        return next.slice(0, s.length + 1);
      });
    }, 60);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-fill py-1.5 pl-3 pr-4 text-[13px] text-fg-2 sm:text-[14px]">
      <Mail className="h-4 w-4 shrink-0 text-accent" />
      <span className="truncate">
        <span className="font-medium text-fg">{text}</span>
        <span className="animate-pulse text-accent">|</span>@{MAIL_DOMAIN}
      </span>
    </div>
  );
}

const SAMPLE = [
  { from: 'Northwind Studio', subject: 'Final cut is ready for review', snippet: 'Uploaded the 4K master and the stems. Notes from Friday are addressed.', time: '9:41 AM', unread: true },
  { from: 'Ada Lovelace', subject: 'Re: Analytical Engine notes', snippet: 'I have annotated the second section with the algorithm for Bernoulli numbers.', time: '9:12 AM', unread: true, star: true },
  { from: 'Grace Hopper', subject: 'Found a bug in relay 70', snippet: 'Panel F. Taped it to the logbook. First actual case of a bug being found.', time: 'Yesterday', clip: true },
  { from: 'Alan Turing', subject: 'Imitation game on Friday?', snippet: 'Can a machine reply to this email convincingly? Let us find out.', time: 'Tuesday' },
  { from: 'Katherine Johnson', subject: 'Trajectory numbers', snippet: 'Checked the figures by hand. They hold. Go for launch.', time: 'Monday' },
];

const AVATAR_TINTS = ['#ff9f0a', '#5e5ce6', '#30b0c7', '#34c759', '#ff375f'];

function MockAvatar({ name, i = 0 }: { name: string; i?: number }) {
  return (
    <span
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${AVATAR_TINTS[i % 5]} 75%, white), ${AVATAR_TINTS[i % 5]})` }}
    >
      {name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)}
    </span>
  );
}

function ProductShot() {
  return (
    <div className="mx-auto mt-16 w-full max-w-[1080px] px-3 sm:px-6">
      <div className="overflow-hidden rounded-[14px] bg-bg text-left shadow-[0_40px_100px_-30px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.12)] dark:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.12)]">
        <div className="flex h-[440px] sm:h-[520px]">
          <aside className="hidden w-[210px] shrink-0 bg-sidebar p-3 md:block">
            <div className="flex gap-2 px-1 pb-5 pt-1">
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                <span key={c} className="size-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="px-2 pb-1 text-[11px] font-semibold text-fg-3">Mailboxes</div>
            {(
              [
                [Inbox, 'Inbox', '2'],
                [Star, 'Starred', ''],
                [Clock, 'Snoozed', ''],
                [Send, 'Sent', ''],
                [FileText, 'Drafts', '1'],
                [Archive, 'Archive', ''],
              ] as const
            ).map(([Icon, label, n], i) => (
              <div key={label} className={cx('flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px]', i === 0 ? 'bg-fill-2 text-fg' : 'text-fg')}>
                <Icon className="h-3.5 w-3.5 text-accent" />
                <span className="flex-1">{label}</span>
                <span className="text-[11px] text-fg-3">{n}</span>
              </div>
            ))}
          </aside>
          <div className="w-full shrink-0 border-r border-line sm:w-[330px]">
            <div className="flex items-end justify-between px-4 pb-2 pt-4">
              <div>
                <div className="font-display text-[19px] font-bold leading-none">Inbox</div>
                <div className="mt-1 text-[11px] text-fg-3">2 unread</div>
              </div>
              <Search className="h-4 w-4 text-fg-3" />
            </div>
            <div className="px-1.5">
              {SAMPLE.map((m, i) => (
                <div key={m.subject} className={cx('relative flex gap-2.5 rounded-lg px-3 py-2', i === 1 && 'bg-selected')}>
                  {m.unread && <span className="absolute left-1 top-[18px] h-2 w-2 rounded-full bg-accent" />}
                  <MockAvatar name={m.from} i={i} />
                  <div className="min-w-0 flex-1">
                    <div className="flex text-[12.5px]">
                      <span className={cx('flex-1 truncate', m.unread ? 'font-semibold' : '')}>{m.from}</span>
                      <span className="text-[11px] text-fg-3">{m.time}</span>
                    </div>
                    <div className="flex items-center gap-1 truncate text-[12px]">
                      <span className="truncate">{m.subject}</span>
                      {m.star && <Star className="h-3 w-3 shrink-0 fill-[#ff9f0a] text-[#ff9f0a]" />}
                      {m.clip && <Paperclip className="h-3 w-3 shrink-0 text-fg-3" />}
                    </div>
                    <div className="line-clamp-1 text-[11.5px] leading-snug text-fg-2">{m.snippet}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 flex-col sm:flex">
            <div className="flex h-11 items-center justify-end gap-4 px-5 text-fg-2">
              {[Archive, Trash2, ShieldAlert, Star].map((I, i) => (
                <I key={i} className="h-4 w-4" />
              ))}
            </div>
            <div className="px-7 pb-6 pt-2">
              <div className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em]">Re: Analytical Engine notes</div>
              <div className="mt-5 flex items-center gap-3">
                <MockAvatar name="Ada Lovelace" i={1} />
                <div>
                  <div className="text-[13px] font-semibold">Ada Lovelace</div>
                  <div className="text-[11.5px] text-fg-3">To: you · 9:12 AM</div>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-[13px] leading-relaxed text-fg">
                <p>I have annotated the second section with the algorithm for computing Bernoulli numbers.</p>
                <p className="text-fg-2">
                  The engine might act upon other things besides number, if those things could be expressed in its notation. Perhaps even email.
                </p>
              </div>
              <div className="mt-5 inline-flex h-12 items-center gap-2.5 rounded-xl bg-fill px-3.5">
                <FileText className="h-5 w-5 text-[#ff3b30]" />
                <div className="text-[11.5px]">
                  <div className="font-medium">Note G.pdf</div>
                  <div className="text-fg-3">284 KB</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-20">
      <SoftLights />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-16 text-center sm:px-6 sm:pt-24">
        <EmailMark size={72} className="mb-7 drop-shadow-[0_10px_24px_rgba(10,108,255,0.35)]" />
        <a
          href="#own"
          className="mb-5 inline-flex h-7 items-center gap-2 rounded-full bg-fill px-3.5 text-[13px] font-medium leading-none text-fg-2 transition hover:text-fg"
        >
          <Code2 className="h-3.5 w-3.5 text-accent" />
          <span>Open source</span>
          <span className="h-3 w-px bg-line-strong" aria-hidden />
          <span>Built on</span>
          {/* The logotype's x-height sits on the text baseline at this size. */}
          <AppwriteLogotype className="-ml-0.5 h-[13px] w-auto translate-y-[1px] text-fg" />
        </a>
        <h1 className="text-gradient-brand max-w-4xl text-balance font-display text-[52px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[80px]">
          Email you actually own.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-[19px] leading-relaxed text-fg-2 sm:text-[21px]">
          A beautifully simple, open-source inbox. Your mail lives in your own database, on Appwrite Cloud or on your own Appwrite instance.
        </p>
        <div className="mt-9 flex flex-col items-center gap-5 sm:flex-row">
          <Link to="/signup" className={cx(pillPrimary, 'h-11 px-7 text-[16px]')}>
            Get your free address
          </Link>
          <a href="#deploy" className={cx(pillSecondary, 'h-11 text-[16px]')}>
            Run your own <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-8 flex w-full max-w-full justify-center">
          <TypedAddress />
        </div>
      </div>
      <ProductShot />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

function Tile({
  icon: Icon,
  tint,
  title,
  body,
  className,
  children,
}: {
  icon: typeof Mail;
  tint: string;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Reveal className={cx('flex flex-col overflow-hidden rounded-[28px] bg-sunken p-7 sm:p-8', className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-[11px] text-white" style={{ background: tint }}>
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-5 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">{title}</h3>
      <p className="mt-2 max-w-md text-pretty text-[15px] leading-relaxed text-fg-2">{body}</p>
      {children && <div className="mt-7 flex flex-1 items-end">{children}</div>}
    </Reveal>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-14 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle eyebrow="Features" sub="Everything you expect from a great mail app, and nothing you don’t.">
          Your inbox, finally calm.
        </SectionTitle>
        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Tile
            className="lg:col-span-4"
            icon={Zap}
            tint="#ff9f0a"
            title="Instant, everywhere"
            body="New mail appears the moment it arrives, in every open window. No refresh button, no waiting."
          >
            <div className="w-full max-w-md rounded-2xl bg-bg p-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <EmailMark size={32} />
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-fg">Grace Hopper</span>
                    <span className="text-[11.5px] text-fg-3">now</span>
                  </div>
                  <div className="truncate text-fg-2">Found a bug in relay 70</div>
                </div>
              </div>
            </div>
          </Tile>
          <Tile
            className="lg:col-span-2"
            icon={Paperclip}
            tint="#5e5ce6"
            title="Attachments"
            body="Preview photos and documents inline, then download in one click."
          />
          <Tile
            className="lg:col-span-2"
            icon={CheckCircle2}
            tint="#007aff"
            title="Select many at once"
            body="Check off a batch of messages and archive, move, label or delete them together."
          >
            <div className="w-full space-y-1.5">
              {['Weekly digest', 'Your receipt', 'Shipping update'].map((t, i) => (
                <div key={t} className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-2 text-[13px]">
                  <span className={cx('flex h-[18px] w-[18px] items-center justify-center rounded-full', i < 2 ? 'bg-accent' : 'border-[1.5px] border-fg-3')}>
                    {i < 2 && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
                  </span>
                  {t}
                </div>
              ))}
            </div>
          </Tile>
          <Tile
            className="lg:col-span-2"
            icon={Filter}
            tint="#34c759"
            title="Smart rules"
            body="Label, archive or star mail automatically, before it ever reaches your screen."
          />
          <Tile
            className="lg:col-span-2"
            icon={Clock}
            tint="#30b0c7"
            title="Snooze and send later"
            body="Bring a message back when you need it, or schedule a reply for the perfect moment."
          >
            <div className="flex flex-wrap gap-1.5">
              {['Later today', 'Tomorrow', 'This weekend', 'Next week'].map((l) => (
                <span key={l} className="rounded-full bg-bg px-3 py-1 text-[12.5px] text-fg-2">
                  {l}
                </span>
              ))}
            </div>
          </Tile>
          <Tile
            className="lg:col-span-3"
            icon={ShieldAlert}
            tint="#ff375f"
            title="Junk stays out"
            body="Every message is scored for spam. Obvious junk is filed away, and anything borderline is flagged so you decide."
          />
          <Tile
            className="lg:col-span-3"
            icon={Bell}
            tint="#af52de"
            title="Vacation replies and forwarding"
            body="Set an out-of-office reply or forward everything to another address, attachments included."
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Open source and ownership
// ---------------------------------------------------------------------------

function Own() {
  const points: [typeof Mail, string, string][] = [
    [Code2, 'Open source', 'Every line is public. Read it, audit it, fork it and make it yours.'],
    [Database, 'Your database', 'Messages, contacts and settings live in tables you control, not in someone else’s silo.'],
    [Download, 'No lock-in', 'Your files and rows are yours to export, back up or move to another server at any time.'],
    [EyeOff, 'No ads, no tracking', 'Nothing is scanned for ads. Remote images and tracking pixels can stay blocked.'],
    [Lock, 'Sandboxed messages', 'Every email renders in an isolated frame. Scripts never run.'],
    [KeyRound, 'Two-factor sign-in', 'Protect each account with an authenticator app and recovery codes.'],
  ];
  return (
    <section id="own" className="scroll-mt-14 bg-sunken py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle eyebrow="Open source" sub="Most email is rented. This one you can own: the code, the server and every message on it.">
          Your mail. Your data. Your rules.
        </SectionTitle>
        <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {points.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={(i % 3) * 0.06}>
              <Icon className="h-7 w-7 text-accent" strokeWidth={1.75} />
              <h3 className="mt-4 text-[17px] font-semibold text-fg">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-fg-2">{body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-14 flex justify-center">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className={cx(pillPrimary, 'h-11 px-7 text-[16px]')}>
            <Code2 className="h-4 w-4" /> View source on GitHub
          </a>
        </Reveal>
      </div>
    </section>
  );
}

function Deploy() {
  const options: { icon: typeof Mail; tint: string; title: string; body: string; points: string[]; href: string; cta: string }[] = [
    {
      icon: Cloud,
      tint: '#007aff',
      title: 'Appwrite Cloud',
      body: 'Managed hosting with nothing to maintain. Start on the free plan and pick the region your data lives in.',
      points: ['Up in minutes', 'Backups and scaling handled', 'Free plan to start'],
      href: 'https://cloud.appwrite.io',
      cta: 'Open Appwrite Cloud',
    },
    {
      icon: Server,
      tint: '#34c759',
      title: 'Your own Appwrite',
      body: 'Run the whole stack on your hardware with Docker. Mail never leaves servers you control.',
      points: ['Any cloud, VPS or on-premise', 'Full control of storage and keys', 'Same app, same features'],
      href: 'https://appwrite.io/docs/advanced/self-hosting',
      cta: 'Self-hosting guide',
    },
  ];
  return (
    <section id="deploy" className="scroll-mt-14 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle eyebrow="Deploy anywhere" sub="The same open-source app runs on Appwrite Cloud or on your own Appwrite instance. Switch whenever you like.">
          Runs where you want it.
        </SectionTitle>
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          {options.map((o, i) => (
            <Reveal key={o.title} delay={i * 0.08} className="flex flex-col rounded-[28px] bg-sunken p-7 sm:p-9">
              {/* Appwrite mark, badged with where it runs. */}
              <span className="relative flex h-12 w-12 items-center justify-center rounded-[13px] bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12)]">
                <AppwriteLogomark className="h-[22px] w-auto" />
                <span
                  className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white ring-[2.5px] ring-sunken"
                  style={{ background: o.tint }}
                >
                  <o.icon className="h-3.5 w-3.5" />
                </span>
              </span>
              <h3 className="mt-5 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">{o.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{o.body}</p>
              <ul className="mt-5 space-y-2">
                {o.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-[15px] text-fg">
                    <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-accent" /> {p}
                  </li>
                ))}
              </ul>
              <a href={o.href} target="_blank" rel="noreferrer" className={cx(pillSecondary, 'mt-7 self-start text-[15px]')}>
                {o.cta} <ArrowRight className="h-4 w-4" />
              </a>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-4 overflow-hidden rounded-[28px] bg-[#1d1d1f] text-[#f5f5f7]">
          <div className="flex items-center gap-2 px-6 pt-5">
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
              <span key={c} className="size-3 rounded-full" style={{ background: c }} />
            ))}
            <span className="ml-3 text-[12.5px] text-[#a1a1a6]">Terminal</span>
          </div>
          <pre className="overflow-x-auto px-6 pb-6 pt-4 font-mono text-[13.5px] leading-[1.85]">
            <span className="text-[#30d158]">$</span> git clone {REPO_URL} && cd email
            {'\n'}
            <span className="text-[#6e6e73]"># Point at Appwrite Cloud or your own instance</span>
            {'\n'}
            <span className="text-[#30d158]">$</span> export APPWRITE_ENDPOINT=https://your-appwrite/v1 APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=…
            {'\n'}
            <span className="text-[#30d158]">$</span> npm install && node scripts/setup.mjs
            {'\n'}
            <span className="text-[#30d158]">$</span> node scripts/deploy-functions.mjs && node scripts/deploy-site.mjs
            {'\n'}
            <span className="text-[#6e6e73]"># Database, storage, functions and site are ready. Mail away.</span>
          </pre>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

function Keyboard() {
  const keys: [string[], string][] = [
    [['⌘', 'K'], 'Command palette'],
    [['C'], 'Compose'],
    [['J', 'K'], 'Next and previous'],
    [['X'], 'Select'],
    [['E'], 'Archive'],
    [['R'], 'Reply'],
    [['B'], 'Snooze'],
    [['⌘', '↵'], 'Send'],
  ];
  return (
    <section id="keyboard" className="scroll-mt-14 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="mb-3 text-[15px] font-semibold text-accent">Keyboard</p>
          <h2 className="font-display text-[36px] font-bold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[52px]">Fly through your inbox.</h2>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-fg-2">
            Triage without touching the mouse. A command palette, familiar shortcuts and undo send make inbox zero a habit.
          </p>
        </Reveal>
        <Reveal delay={0.08} className="overflow-hidden rounded-[28px] bg-sunken p-2">
          <div className="grid grid-cols-2 gap-2">
            {keys.map(([k, l]) => (
              <div key={l} className="flex items-center justify-between gap-3 rounded-[20px] bg-bg px-4 py-3.5 text-[14px]">
                <span className="text-fg-2">{l}</span>
                <span className="flex gap-1">
                  {k.map((x) => (
                    <Kbd key={x}>{x}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="relative isolate overflow-hidden px-4 py-24 text-center sm:py-32">
      <SoftLights />
      <Reveal>
        <EmailMark size={84} className="mx-auto mb-8 drop-shadow-[0_12px_28px_rgba(10,108,255,0.35)]" />
        <h2 className="text-balance font-display text-[40px] font-bold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[60px]">Own your inbox.</h2>
        <p className="mt-4 text-[19px] text-fg-2">Try it free here, or run your own in minutes.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-5 sm:flex-row">
          <Link to="/signup" className={cx(pillPrimary, 'h-11 px-7 text-[16px]')}>
            Get your free address
          </Link>
          <a href="#deploy" className={cx(pillSecondary, 'h-11 text-[16px]')}>
            Self-host it <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-sunken">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[12px] text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <EmailLockup size={18} />
        <div className="flex gap-6">
          <Link to="/login" className="hover:text-fg">
            Sign in
          </Link>
          <Link to="/signup" className="hover:text-fg">
            Create account
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
            GitHub
          </a>
          <a href="https://appwrite.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-fg">
            Open source · Runs on <AppwriteLogotype className="h-[15px] text-fg" />
          </a>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <Header />
      <Hero />
      <Own />
      <Deploy />
      <Features />
      <Keyboard />
      <ClosingCta />
      <Footer />
    </div>
  );
}
