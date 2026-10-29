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
        'relative inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full border border-transparent transition-colors duration-200',
        checked ? 'bg-fg' : 'bg-fill-2 dark:bg-line-strong',
      )}
    >
      <span
        className={cx(
          'absolute left-[2px] h-[14px] w-[14px] rounded-full transition-transform duration-200',
          checked ? 'translate-x-[14px] bg-bg' : 'bg-white dark:bg-fg-2',
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
// Avatar (gradient initials, brand favicon via Appwrite Avatars)
// ---------------------------------------------------------------------------

// Shows initials immediately, then swaps in the best image once it has loaded:
// the person's photo (Appwrite Avatars, by SHA-256 email hash), else the
// sender's brand icon (Avatars favicon). Verdicts are cached per device.
function storedMap(key: string) {
  try {
    return new Map<string, boolean>(typeof localStorage === 'undefined' ? [] : JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Map<string, boolean>();
  }
}
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
function remember(key: string, map: Map<string, boolean>, id: string, ok: boolean) {
  map.set(id, ok);
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...map].slice(-1000)));
    } catch {
      // ignore
    }
  }, 1000);
}

const BRANDS_KEY = 'ae:brands';
const PHOTOS_KEY = 'ae:photos';
const brandCache = storedMap(BRANDS_KEY);
const photoCache = storedMap(PHOTOS_KEY);
const PHOTO_SIZE = 128;

const hashes = new Map<string, Promise<string>>();
function emailHash(email: string) {
  const key = email.trim().toLowerCase();
  let p = hashes.get(key);
  if (!p) {
    p = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(key))
      .then((d) => Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join(''));
    hashes.set(key, p);
  }
  return p;
}

// Avatars returns a neutral placeholder when there is no photo; it is the same
// image for every unknown address, so one probe tells photos from placeholders.
let placeholder: Promise<Uint8Array> | null = null;
const bytes = (url: string) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => new Uint8Array(b));
function isPlaceholder(data: Uint8Array) {
  placeholder ??= bytes(photoUrl('0'.repeat(64), PHOTO_SIZE));
  return placeholder.then((p) => p.length === data.length && p.every((v, i) => v === data[i]));
}

const photos = new Map<string, Promise<string | null>>();
function resolvePhoto(email: string) {
  const key = email.trim().toLowerCase();
  let p = photos.get(key);
  if (!p) {
    p = emailHash(key).then(async (hash) => {
      const url = photoUrl(hash, PHOTO_SIZE);
      if (photoCache.get(key) === false) return null;
      const data = await bytes(url);
      const ok = !(await isPlaceholder(data));
      remember(PHOTOS_KEY, photoCache, key, ok);
      return ok ? URL.createObjectURL(new Blob([data], { type: 'image/webp' })) : null;
    }).catch(() => null);
    photos.set(key, p);
  }
  return p;
}

export function Avatar({ name, email, size = 36, className }: { name: string; email?: string; size?: number; className?: string }) {
  const brand = email ? brandDomain(email) : null;
  const [photo, setPhoto] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(() => (brand ? brandCache.get(brand) === true : false));
  const tryBrand = brand && brandCache.get(brand) !== false && !photo;

  useEffect(() => {
    setPhoto(null);
    if (!email || typeof crypto === 'undefined' || !crypto.subtle) return;
    let alive = true;
    resolvePhoto(email).then((url) => alive && setPhoto(url));
    return () => {
      alive = false;
    };
  }, [email]);

  const showing = !!photo || loaded;
  return (
    <span
      className={cx('relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-fg-2', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: showing ? 'var(--card)' : 'var(--fill-2)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
      }}
      aria-hidden
    >
      {!showing && <span>{initials(name || email || '?')}</span>}
      {photo ? (
        <img src={photo} alt="" width={size} height={size} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        tryBrand && (
          <img
            src={faviconUrl(brand)}
            alt=""
            width={size * 0.56}
            height={size * 0.56}
            loading="lazy"
            onError={() => remember(BRANDS_KEY, brandCache, brand, false)}
            onLoad={(e) => {
              const ok = (e.target as HTMLImageElement).naturalWidth >= 16;
              remember(BRANDS_KEY, brandCache, brand, ok);
              setLoaded(ok);
            }}
            className={cx('rounded-[4px]', !loaded && 'absolute opacity-0')}
          />
        )
      )}
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
