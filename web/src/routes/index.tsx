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
  Bot,
  Code2,
  Copy,
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
  Plug,
  ShieldAlert,
  Star,
  Trash2,
  Zap,
  ChevronDown,
  FolderInput,
  Forward,
  ListFilter,
  PenSquare,
  RefreshCw,
  Reply,
  ReplyAll,
  Tag,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { SoftLights } from '~/components/AuthLayout';
import { APP_NAME, AppwriteLogomark, AppwriteLogotype, EmailLockup, EmailMark } from '~/components/brand';
import { Kbd, cx } from '~/components/ui';
import { MAIL_DOMAIN } from '~/lib/appwrite';
import { INSTALL, MCP_URL, OPENAPI_URL } from '~/lib/developer';

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
      <div className="relative mx-auto flex h-12 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link to="/" aria-label={`${APP_NAME} home`}>
          <EmailLockup size={22} />
        </Link>
        {/* Centered on the header itself, not on the space between logo and buttons. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 text-[12.5px] text-fg-2 md:flex">
          {[
            ['#developers', 'API & MCP'],
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

// A faithful, static rendering of the real app (sidebar, list, reader), built
// from the same tokens and sizes so the hero shows exactly what users get.
const SAMPLE = [
  { from: 'Northwind Studio', subject: 'Final cut is ready for review', snippet: 'Uploaded the 4K master and the stems. Notes from Friday are addressed, color pass is done.', time: '9:41 AM', unread: true, clip: true },
  { from: 'Ada Lovelace', subject: 'Re: Analytical Engine notes', snippet: 'I have annotated the second section with the algorithm for computing Bernoulli numbers.', time: '9:12 AM', unread: true, star: true },
  { from: 'Grace Hopper', subject: 'Found a bug in relay 70', snippet: 'Panel F. Taped it to the logbook. First actual case of a bug being found.', time: 'Yesterday', clip: true },
  { from: 'Prize Department', subject: 'Act now! You have won', snippet: 'Confirm your details to claim the reward before midnight tonight.', time: 'Yesterday', spam: true },
  { from: 'Alan Turing', subject: 'Imitation game on Friday?', snippet: 'Can a machine reply to this email convincingly? Let us find out together.', time: 'Tuesday' },
  { from: 'Katherine Johnson', subject: 'Trajectory numbers', snippet: 'Checked the figures by hand. They hold. Go for launch whenever you are ready.', time: 'Monday' },
];

function MockAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-fill-2 font-semibold text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}

const MOCK_FOLDERS: [typeof Inbox, string, string][] = [
  [Inbox, 'Inbox', '2'],
  [Star, 'Starred', ''],
  [Clock, 'Snoozed', ''],
  [FileText, 'Drafts', '1'],
  [Send, 'Sent', ''],
  [Archive, 'Archive', ''],
  [ShieldAlert, 'Junk', '1'],
  [Trash2, 'Trash', ''],
];

function ProductShot() {
  return (
    <div className="mx-auto mt-16 w-full max-w-[1120px] px-3 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none overflow-hidden rounded-[14px] bg-bg text-left text-fg shadow-[0_40px_100px_-30px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.12)] select-none dark:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8),0_0_0_0.5px_rgba(255,255,255,0.12)]"
      >
        <div className="flex h-[460px] sm:h-[560px]">
          {/* Sidebar */}
          <aside className="hidden w-[208px] shrink-0 flex-col border-r border-line bg-sidebar md:flex">
            <div className="flex h-9 items-center gap-2 px-4 pt-1">
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                <span key={c} className="size-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="flex h-10 items-center justify-between pl-4 pr-3">
              <EmailLockup size={16} />
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
                <PenSquare className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="px-2.5">
              <div className="mb-1 mt-2.5 px-2 text-[11px] font-semibold text-fg-3">Mailboxes</div>
              {MOCK_FOLDERS.map(([Icon, label, n], i) => (
                <div
                  key={label}
                  className={cx('flex h-7 items-center gap-2.5 rounded-md px-2 text-[12.5px]', i === 0 ? 'bg-fill-2 font-medium text-fg' : 'text-fg-2')}
                >
                  <Icon className={cx('h-3.5 w-3.5', i === 0 ? 'text-fg' : 'text-fg-3')} />
                  <span className="flex-1">{label}</span>
                  <span className="text-[10.5px] tabular-nums text-fg-3">{n}</span>
                </div>
              ))}
              <div className="mb-1 mt-5 px-2 text-[11px] font-semibold text-fg-3">Labels</div>
              {[
                ['#ff3b30', 'Work'],
                ['#007aff', 'Travel'],
              ].map(([c, l]) => (
                <div key={l} className="flex h-7 items-center gap-2.5 rounded-md px-2 text-[12.5px] text-fg-2">
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                  </span>
                  {l}
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-2.5 border-t border-line px-3 py-2.5">
              <MockAvatar name="Grace Lee" size={28} />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium">Grace Lee</div>
                <div className="truncate text-[10.5px] text-fg-3">grace@inbox-…</div>
              </div>
              <ChevronDown className="ml-auto h-3.5 w-3.5 text-fg-3" />
            </div>
          </aside>

          {/* Message list */}
          <div className="flex w-full shrink-0 flex-col border-r border-line bg-surface sm:w-[330px]">
            <div className="flex h-[46px] items-center gap-1 px-3">
              <div className="min-w-0 flex-1 pl-1">
                <div className="font-display text-[17px] font-bold leading-tight tracking-[-0.01em]">Inbox</div>
                <div className="text-[10.5px] leading-tight text-fg-3">2 unread</div>
              </div>
              <span className="px-1.5 text-[12px] font-medium text-accent">Select</span>
              <RefreshCw className="mx-1.5 h-3.5 w-3.5 text-fg-2" />
              <ListFilter className="mx-1.5 h-3.5 w-3.5 text-fg-2" />
            </div>
            <div className="border-b border-line px-3 pb-2">
              <div className="flex h-7 items-center gap-2 rounded-md border border-line px-2.5 text-[12px] text-fg-3 dark:border-line-strong">
                <Search className="h-3 w-3" />
                <span className="flex-1">Search Inbox</span>
                <Kbd className="h-4 min-w-4 text-[10px]">/</Kbd>
              </div>
            </div>
            <div className="overflow-hidden pt-1.5">
              {SAMPLE.map((m, i) => (
                <div key={m.subject} className={cx('relative mx-1.5 flex gap-2.5 rounded-md px-3 py-2', i === 1 && 'bg-selected')}>
                  <span className="absolute left-0 top-0 flex h-full w-3 justify-center pt-[17px]">
                    {m.unread && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </span>
                  <MockAvatar name={m.from} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cx('flex-1 truncate text-[12.5px]', m.unread && 'font-semibold')}>{m.from}</span>
                      <span className="shrink-0 text-[10.5px] tabular-nums text-fg-3">{m.time}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cx('flex-1 truncate text-[12px]', m.unread && 'font-semibold')}>{m.subject}</span>
                      {m.spam && <span className="rounded-md bg-[rgba(245,158,11,0.12)] px-1.5 py-px text-[9.5px] font-medium text-warning">Possible spam</span>}
                      {m.clip && <Paperclip className="h-3 w-3 shrink-0 text-fg-3" />}
                      {m.star && <Star className="h-3 w-3 shrink-0 fill-accent text-accent" />}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.4] text-fg-2">{m.snippet}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reader */}
          <div className="hidden min-w-0 flex-1 flex-col bg-surface sm:flex">
            <div className="flex h-[46px] items-center justify-between border-b border-line px-4 text-fg-2">
              <div className="flex gap-3.5">
                {[Archive, Trash2, ShieldAlert, FolderInput, Tag, Star].map((I, i) => (
                  <I key={i} className="h-3.5 w-3.5" />
                ))}
              </div>
              <div className="flex gap-3.5">
                {[Reply, ReplyAll, Forward].map((I, i) => (
                  <I key={i} className="h-3.5 w-3.5" />
                ))}
              </div>
            </div>
            <div className="overflow-hidden px-7 pt-5">
              <div className="font-display text-[21px] font-bold leading-[1.15] tracking-[-0.025em]">Re: Analytical Engine notes</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[10.5px] text-fg-3">2 messages</span>
                <span className="rounded-md px-1.5 text-[10.5px] font-medium" style={{ background: '#ff3b301f', color: '#ff3b30' }}>
                  Work
                </span>
              </div>
              {/* Collapsed earlier message */}
              <div className="mt-3 flex items-center gap-3 py-2.5">
                <MockAvatar name="Grace Lee" size={28} />
                <span className="text-[12.5px] font-semibold">Grace Lee</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-3">Could you share the notes on the engine before Friday?</span>
                <span className="text-[10.5px] text-fg-3">8:02 AM</span>
              </div>
              {/* Expanded latest message */}
              <div className="border-t border-line pt-4">
                <div className="flex items-start gap-3">
                  <MockAvatar name="Ada Lovelace" size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold tracking-[-0.01em]">Ada Lovelace</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-3">
                      <span className="truncate">ada@analytical.engine</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5 text-fg-2">
                        to me <ChevronDown className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] tabular-nums text-fg-3">Today 9:12 AM</span>
                </div>
                <div className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed">
                  <p>Hi Grace,</p>
                  <p>I have annotated the second section with the algorithm for computing Bernoulli numbers. The full notes are attached.</p>
                  <p className="text-fg-2">
                    The engine might act upon other things besides number, if those things could be expressed in its notation. Perhaps even email.
                  </p>
                </div>
                <div className="mt-4 w-[150px]">
                  <div className="flex h-[84px] items-center justify-center rounded-2xl bg-fill">
                    <FileText className="h-7 w-7 text-accent" />
                  </div>
                  <div className="px-1 pt-1.5 text-[11.5px] font-medium">Note G.pdf</div>
                  <div className="px-1 text-[10.5px] text-fg-3">284 KB</div>
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <div className="flex h-10 flex-1 items-center gap-2.5 rounded-full bg-fill px-4 text-[12.5px] text-fg-3">
                    <Reply className="h-4 w-4" /> Reply to Ada Lovelace…
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-fg-2">
                    <Forward className="h-4 w-4" />
                  </span>
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
          A beautifully simple, open-source inbox with a built-in API and MCP server, so your AI can read, triage and reply for you. Runs on
          Appwrite Cloud or your own Appwrite.
        </p>
        <div className="mt-9 flex flex-col items-center gap-5 sm:flex-row">
          <Link to="/signup" className={cx(pillPrimary, 'h-11 px-7 text-[16px]')}>
            Get your free address
          </Link>
          <a href="#developers" className={cx(pill, 'h-11 bg-fill px-6 text-[16px] text-fg hover:bg-fill-2')}>
            <Bot className="h-[18px] w-[18px] text-accent" /> Connect your AI
          </a>
        </div>
        <div className="mt-8 flex w-full max-w-full flex-col items-center justify-center gap-2.5 sm:flex-row">
          <TypedAddress />
          <McpChip />
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

// ---------------------------------------------------------------------------
// API and MCP
// ---------------------------------------------------------------------------

function McpChip() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(MCP_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy MCP server URL"
      className="icon-hover inline-flex max-w-full items-center gap-2 rounded-full bg-fill py-1.5 pl-3 pr-3.5 text-[13px] text-fg-2 transition hover:bg-fill-2 sm:text-[14px]"
    >
      <Plug className="h-4 w-4 shrink-0 text-accent" />
      <span className="truncate font-medium text-fg">MCP</span>
      <span className="truncate">{MCP_URL.replace('https://', '')}</span>
      <span className="icon-anim">{copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}</span>
    </button>
  );
}

const TRANSCRIPT: [string, string, string][] = [
  ['list_messages', 'unread, inbox', '12 found'],
  ['update_messages', '7 newsletters → archive', 'done'],
  ['read_thread', 'Re: Analytical Engine notes', '3 messages'],
  ['reply_to_email', 'to Ada Lovelace', 'sent'],
];

// The assistant demo plays its tool calls one by one when scrolled into view.
function AssistantDemo() {
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) return;
    if (step >= TRANSCRIPT.length + 1) return;
    const t = setTimeout(() => setStep((n) => n + 1), step === 0 ? 500 : 650);
    return () => clearTimeout(t);
  }, [started, step]);
  return (
    <motion.div
      onViewportEnter={() => setStarted(true)}
      viewport={{ once: true, margin: '-80px' }}
      className="rounded-[26px] bg-white/[0.06] p-2 ring-1 ring-white/10"
    >
      <div className="rounded-[20px] bg-[#161618] p-6 text-[15px]">
        <div className="flex items-center gap-2 text-[13px] text-white/50">
          <Sparkle /> Your assistant
        </div>
        <p className="mt-3 rounded-2xl rounded-tl-md bg-white/[0.07] px-4 py-3 text-white">
          Clear out today’s newsletters and reply to Ada saying I’ll review the notes on Friday.
        </p>
        <div className="mt-4 space-y-2 font-mono text-[13px]">
          {TRANSCRIPT.map(([tool, arg, out], i) => (
            <div
              key={tool}
              className={cx(
                'flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-3.5 py-2.5 transition-all duration-500 ease-apple',
                step > i ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              <span className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full', step > i + 1 || step > TRANSCRIPT.length ? 'bg-[#30d158]' : 'bg-white/15')}>
                {(step > i + 1 || step > TRANSCRIPT.length) && <Check className="h-2.5 w-2.5 text-black" strokeWidth={4} />}
              </span>
              <span className="text-white">{tool}</span>
              <span className="truncate text-white/40">{arg}</span>
              <span className="ml-auto shrink-0 text-white/60">{out}</span>
            </div>
          ))}
        </div>
        <p
          className={cx(
            'mt-4 text-white/80 transition-opacity duration-500',
            step > TRANSCRIPT.length ? 'opacity-100' : 'opacity-0',
          )}
        >
          Done. I archived 7 newsletters and told Ada you’ll review the notes on Friday.
        </p>
      </div>
    </motion.div>
  );
}

function Programmable() {
  const clients = ['Claude', 'ChatGPT', 'Cursor', 'VS Code', 'Claude Code', 'Any MCP client'];
  const cards: [typeof Mail, string, string][] = [
    [Plug, 'Remote MCP server', 'Eight tools to search, read, send, reply and organize. Streamable HTTP, works with every major assistant.'],
    [Code2, 'REST API', 'Clean JSON endpoints with an OpenAPI 3.1 spec. Search, read, send and update in a few lines.'],
    [KeyRound, 'OAuth 2.1 built in', 'One-click sign-in with scoped access, plus personal API keys for scripts. Revoke any time.'],
  ];
  return (
    <section id="developers" className="relative isolate scroll-mt-12 overflow-hidden bg-[#0b0b0d] py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -left-[20%] top-[-30%] h-[700px] w-[900px] bg-[radial-gradient(ellipse_at_center,rgba(10,132,255,0.28),transparent_65%)]" />
        <div className="absolute -right-[20%] bottom-[-30%] h-[700px] w-[900px] bg-[radial-gradient(ellipse_at_center,rgba(191,90,242,0.2),transparent_65%)]" />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-[14px] font-medium text-white/80">
            <Bot className="h-4 w-4 text-[#0a84ff]" /> API and MCP
          </p>
          <h2 className="text-balance font-display text-[44px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[76px]">
            Your inbox,
            <br />
            <span className="bg-gradient-to-r from-[#5ac8fa] via-[#0a84ff] to-[#bf5af2] bg-clip-text text-transparent">programmable.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-[19px] leading-relaxed text-white/65 sm:text-[21px]">
            Hand the inbox to your AI. Connect Claude, ChatGPT or your editor with one click and a sign-in, or build on the API. No passwords, no
            pasted tokens.
          </p>
        </Reveal>

        <Reveal delay={0.05} className="mx-auto mt-10 max-w-2xl">
          <CopyBar value={MCP_URL} />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href={INSTALL.cursor} className={cx(pill, 'h-10 bg-white px-5 text-[14.5px] text-black hover:bg-white/90')}>
              Add to Cursor
            </a>
            <a href={INSTALL.vscode} className={cx(pill, 'h-10 bg-white/10 px-5 text-[14.5px] text-white hover:bg-white/15')}>
              Add to VS Code
            </a>
            <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" className={cx(pill, 'h-10 bg-white/10 px-5 text-[14.5px] text-white hover:bg-white/15')}>
              Add to Claude
            </a>
            <Link to="/developers" className={cx(pill, 'h-10 px-4 text-[14.5px] text-[#0a84ff] hover:underline')}>
              Developer docs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px] text-white/45">
            {clients.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </Reveal>

        <div className="mt-16 grid items-stretch gap-4 lg:grid-cols-2">
          <AssistantDemo />
          <Reveal delay={0.08} className="flex flex-col overflow-hidden rounded-[26px] bg-white/[0.06] p-2 ring-1 ring-white/10">
            <div className="flex flex-1 flex-col rounded-[20px] bg-[#161618]">
              <div className="flex items-center gap-2 px-5 pt-4 text-[12.5px] text-white/50">
                {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                  <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
                ))}
                <span className="ml-2">REST API</span>
              </div>
              <pre className="flex-1 overflow-x-auto p-5 font-mono text-[13px] leading-[1.8] text-white/90">
                <span className="text-white/35"># Find unread invoices</span>
                {'\n'}curl {'"'}
                <span className="text-[#5ac8fa]">{MCP_URL.replace('/mcp', '')}/v1/messages?q=invoice&unread=true</span>
                {'" \\\n'}  -H <span className="text-[#ffd60a]">{'"Authorization: Bearer $MAIL_KEY"'}</span>
                {'\n\n'}
                <span className="text-white/35"># Reply in the same thread</span>
                {'\n'}curl -X POST <span className="text-[#5ac8fa]">{MCP_URL.replace('/mcp', '')}/v1/messages</span>
                {' \\\n'}  -H <span className="text-[#ffd60a]">{'"Authorization: Bearer $MAIL_KEY"'}</span>
                {' \\\n'}  -d <span className="text-[#30d158]">{`'{"replyTo": "<id>", "text": "Paid, thanks!"}'`}</span>
              </pre>
              <a href={OPENAPI_URL} target="_blank" rel="noreferrer" className="mx-5 mb-5 inline-flex items-center gap-1 text-[14px] font-medium text-[#0a84ff] hover:underline">
                OpenAPI spec <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </Reveal>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {cards.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={i * 0.06} className="rounded-[26px] bg-white/[0.06] p-7 ring-1 ring-white/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#0a84ff]">
                <Icon className="h-5 w-5 text-white" />
              </span>
              <h3 className="mt-5 text-[20px] font-bold tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CopyBar({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.08] py-2 pl-5 pr-2 ring-1 ring-white/10">
      <Plug className="h-5 w-5 shrink-0 text-[#0a84ff]" />
      <code className="min-w-0 flex-1 truncate font-mono text-[15px] text-white">{value}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="icon-hover inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-[14px] font-medium text-black transition hover:bg-white/90"
      >
        <span className="icon-anim">{copied ? <Check className="h-4 w-4 text-[#28a745]" /> : <Copy className="h-4 w-4" />}</span>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-accent" fill="currentColor" aria-hidden>
      <path d="M8 0c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6Z" transform="translate(1 2) scale(.85)" />
    </svg>
  );
}

function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <Header />
      <Hero />
      <Programmable />
      <Own />
      <Deploy />
      <Features />
      <Keyboard />
      <ClosingCta />
      <Footer />
    </div>
  );
}
