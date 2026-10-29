import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { faviconUrl, photoUrl } from '~/lib/appwrite';
import { brandDomain, initials } from '~/lib/format';

export const cx = clsx;

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-[background,color,opacity,border-color] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-4 text-[14px]',
        size === 'lg' && 'h-10 px-6 text-[14px]',
        // The accent is reserved for the action we want taken.
        variant === 'primary' && 'border-transparent bg-accent text-accent-fg hover:opacity-90',
        variant === 'secondary' && 'border-line bg-transparent text-fg-2 hover:bg-fill hover:text-fg dark:border-line-strong',
        variant === 'ghost' && 'border-transparent text-fg-2 hover:bg-fill hover:text-fg',
        variant === 'plain' && 'h-auto border-transparent px-0 text-accent hover:opacity-80',
        variant === 'danger' && 'border-transparent bg-danger text-white hover:opacity-90 dark:bg-[#dc2626]',
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="absolute" size={16} />}
      <span className={cx('inline-flex items-center gap-1.5', loading && 'opacity-0')}>{children}</span>
    </button>
  );
});

// Click animation per action, picked from the button's label unless set.
export type IconAnim = 'pop' | 'spin' | 'wiggle' | 'drop' | 'star' | 'tilt' | 'shake' | 'nudge' | 'none';
function animFor(label: string): IconAnim {
  const l = label.toLowerCase();
  if (/delete|trash|discard|remove/.test(l)) return 'wiggle';
  if (/archive|move|restore|labels?\b/.test(l)) return 'drop';
  if (/star/.test(l)) return 'star';
  if (/junk|spam|block/.test(l)) return 'shake';
  if (/refresh|reload/.test(l)) return 'spin';
  if (/reply|forward|back|snooze/.test(l)) return 'nudge';
  if (/mark|read|filter|more|formatting/.test(l)) return 'tilt';
  return 'pop';
}

/** Restarts a one-shot icon animation on every click. */
export function useIconAnim(anim: IconAnim) {
  const [tick, setTick] = useState(0);
  return {
    trigger: () => anim !== 'none' && setTick((t) => t + 1),
    // Keyed by click count, so a fast second click restarts the animation.
    wrap: (children: ReactNode) => (
      <span key={tick} className={cx('icon-anim', tick > 0 && `icon-${anim}`)}>
        {children}
      </span>
    ),
  };
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: 'sm' | 'md'; anim?: IconAnim }
>(function IconButton({ label, active, size = 'md', anim, className, children, onClick, ...props }, ref) {
  const icon = useIconAnim(anim ?? animFor(label));
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      onClick={(e) => {
        icon.trigger();
        onClick?.(e);
      }}
      className={cx(
        'icon-btn inline-flex shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors duration-100 hover:bg-fill hover:text-fg active:bg-fill-2 disabled:pointer-events-none disabled:opacity-35',
        size === 'md' ? 'h-8 w-8' : 'h-7 w-7',
        active && 'bg-fill-2 text-fg',
        className,
      )}
      {...props}
    >
      {icon.wrap(children)}
    </button>
  );
});

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x="11"
          y="2"
          width="2"
          height="6"
          rx="1"
          fill="currentColor"
          opacity={0.2 + (i / 8) * 0.8}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-fill-2 px-1 text-[11px] font-medium text-fg',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          'h-9 w-full rounded-md border bg-transparent px-3 text-[14px] text-fg placeholder:text-fg-3 transition-[border,box-shadow] outline-none focus:border-fg-3 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--fg-3)_22%,transparent)] dark:bg-fill/50',
          invalid ? 'border-danger' : 'border-line dark:border-line-strong',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-relaxed text-fg-2">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-success' : 'bg-fill-2 dark:bg-line-strong',
      )}
    >
      {/* System-style switch: green when on, white knob with a soft shadow. */}
      <span
        className={cx(
          'absolute left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-apple',
          checked && 'translate-x-[16px]',
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cx('inline-flex h-8 rounded-lg bg-fill p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'relative h-full rounded-md px-3 text-[13px] font-medium transition-colors',
            value === o.value ? 'text-fg' : 'text-fg-2 hover:text-fg',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${options.map((x) => x.value).join('')}`}
              className="absolute inset-0 rounded-md border border-line bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:border-line-strong dark:bg-fill-2"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar (photo, brand icon or initials, resolved once and cached)
// ---------------------------------------------------------------------------

// Avatars resolve once per address, to the person's photo (Appwrite Avatars,
// by SHA-256 email hash), else the sender's brand icon, else initials. The
// result, image included, is cached on the device, so an avatar renders in
// its final form on first paint and never swaps midway.
const AVATARS_KEY = 'ae:avatars:v1';
const PHOTO_SIZE = 128;
const MAX_ENTRY = 48_000;
// email -> 'p:<data url>' (photo), 'b:<data url>' (brand icon) or '' (initials)
const avatarCache = new Map<string, string>(
  (() => {
    try {
      return typeof localStorage === 'undefined' ? [] : JSON.parse(localStorage.getItem(AVATARS_KEY) || '[]');
    } catch {
      return [];
    }
  })(),
);
let avatarSaveTimer: ReturnType<typeof setTimeout> | undefined;
function rememberAvatar(email: string, value: string) {
  avatarCache.delete(email);
  avatarCache.set(email, value);
  clearTimeout(avatarSaveTimer);
  avatarSaveTimer = setTimeout(() => {
    // Newest 400 entries; drop older ones until it fits the storage quota.
    let entries = [...avatarCache].slice(-400);
    while (entries.length) {
      try {
        localStorage.setItem(AVATARS_KEY, JSON.stringify(entries));
        return;
      } catch {
        entries = entries.slice(Math.ceil(entries.length / 4));
      }
    }
  }, 800);
}

const fetchBytes = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => new Uint8Array(b));

const toDataUrl = (data: Uint8Array, type: string) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(new Blob([data as BlobPart], { type }));
  });

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Avatars returns the same neutral placeholder for every address without a
// photo, so one probe tells real photos apart.
let placeholder: Promise<Uint8Array> | null = null;
async function isPlaceholder(data: Uint8Array) {
  placeholder ??= fetchBytes(photoUrl('0'.repeat(64), PHOTO_SIZE));
  const p = await placeholder;
  return p.length === data.length && p.every((v, i) => v === data[i]);
}

async function brandIcon(domain: string) {
  const data = await fetchBytes(faviconUrl(domain));
  const bitmap = await createImageBitmap(new Blob([data as BlobPart]));
  const ok = bitmap.width >= 16;
  bitmap.close();
  return ok && data.length <= MAX_ENTRY ? `b:${await toDataUrl(data, 'image/png')}` : '';
}

const pending = new Map<string, Promise<string>>();
function resolveAvatar(email: string): Promise<string> {
  const key = email.trim().toLowerCase();
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      try {
        const data = await fetchBytes(photoUrl(await sha256(key), PHOTO_SIZE));
        if (!(await isPlaceholder(data)) && data.length <= MAX_ENTRY) return `p:${await toDataUrl(data, 'image/webp')}`;
      } catch {
        // fall through to the brand icon
      }
      const domain = brandDomain(key);
      if (domain) return brandIcon(domain).catch(() => '');
      return '';
    })().then((value) => {
      rememberAvatar(key, value);
      return value;
    });
    pending.set(key, p);
  }
  return p;
}

/** Resolves avatars ahead of time, for example for a page of messages. */
export function warmAvatars(emails: (string | undefined)[]) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return;
  for (const e of emails) if (e && !avatarCache.has(e.trim().toLowerCase())) resolveAvatar(e);
}

// How long a new avatar may stay blank before settling on initials.
const SETTLE_MS = 900;

export function Avatar({ name, email, size = 36, className }: { name: string; email?: string; size?: number; className?: string }) {
  const key = email?.trim().toLowerCase() || '';
  const [value, setValue] = useState<string | undefined>(() => (key ? avatarCache.get(key) : ''));

  useEffect(() => {
    const cached = key ? avatarCache.get(key) : '';
    setValue(cached);
    if (cached !== undefined || typeof crypto === 'undefined' || !crypto.subtle) return;
    // Unknown address: stay blank briefly while it resolves, then show the
    // final image. If that takes too long, settle on initials for this view.
    let alive = true;
    const timer = setTimeout(() => alive && setValue(''), SETTLE_MS);
    resolveAvatar(key).then((v) => {
      if (!alive) return;
      clearTimeout(timer);
      setValue((current) => (current === undefined ? v : current));
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);

  const photo = value?.startsWith('p:') ? value.slice(2) : null;
  const brand = value?.startsWith('b:') ? value.slice(2) : null;
  return (
    <span
      className={cx('relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-fg-2', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: brand ? 'var(--card)' : 'var(--fill-2)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
      }}
      aria-hidden
    >
      {photo ? (
        <img src={photo} alt="" width={size} height={size} decoding="sync" className="h-full w-full object-cover" />
      ) : brand ? (
        <img src={brand} alt="" width={size * 0.56} height={size * 0.56} decoding="sync" className="rounded-[4px]" />
      ) : value === '' ? (
        <span>{initials(name || email || '?')}</span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Popover / Menu
// ---------------------------------------------------------------------------

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export function Popover({
  open,
  onClose,
  anchor,
  placement = 'bottom-start',
  children,
  className,
  width,
}: {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const el = ref.current;
      const w = el?.offsetWidth || width || 220;
      const h = el?.offsetHeight || 200;
      let top = placement.startsWith('bottom') ? r.bottom + 6 : r.top - h - 6;
      let left = placement.endsWith('start') ? r.left : r.right - w;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      if (top < 8) top = r.bottom + 6;
      left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, placement, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.96, y: placement.startsWith('bottom') ? -4 : 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, transformOrigin: placement.replace('-', ' ') }}
          className={cx(
            'fixed z-[80] rounded-xl border border-line bg-elevated p-1 shadow-pop dark:border-line-strong',
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  shortcut,
  danger,
  checked,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  shortcut?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-fill-2 disabled:opacity-40',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {checked !== undefined && (
        <span className="w-3.5 text-[12px]">{checked ? '✓' : ''}</span>
      )}
      {icon && <span className="flex w-4 justify-center text-fg-2 group-hover:text-fg [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-[12px] text-fg-3">{shortcut}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-line dark:bg-line-strong" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[11.5px] font-semibold text-fg-3">{children}</div>;
}

// ---------------------------------------------------------------------------
// Modal sheet
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  children,
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className={cx('relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-elevated shadow-pop dark:border-line-strong', className)}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Empty state. `overlay` centres it on the nearest positioned ancestor (the
 * whole column, header included) so empty states in neighbouring panes line up.
 */
export function Empty({ icon, title, children, overlay }: { icon: ReactNode; title: string; children?: ReactNode; overlay?: boolean }) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center px-8 text-center',
        overlay ? 'pointer-events-none absolute inset-0' : 'h-full w-full',
      )}
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-fill/60 text-fg-2 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <div className="font-display font-bold text-[19px] tracking-[-0.01em] text-fg">{title}</div>
      {/* Always two lines tall, so empty states side by side share one baseline. */}
      <div className="mt-1.5 min-h-[44px] max-w-xs text-[13.5px] leading-[22px] text-fg-2">{children}</div>
    </div>
  );
}
