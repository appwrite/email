import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createStore } from '~/lib/store';
import { cx } from './ui';

export type MenuEntry =
  | {
      label: string;
      icon?: ReactNode;
      onSelect?: () => void;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      submenu?: MenuEntry[];
    }
  | { separator: true }
  | { heading: string };

type MenuState = { x: number; y: number; items: MenuEntry[] } | null;
const menuStore = createStore<{ menu: MenuState }>({ menu: null });

/** Opens the app's context menu at the pointer. Items with `false`/`null` are skipped. */
export function openContextMenu(e: ReactMouseEvent | MouseEvent, items: (MenuEntry | false | null | undefined)[]) {
  const list = tidy(items);
  if (!list.length) return;
  e.preventDefault();
  e.stopPropagation();
  menuStore.set({ menu: { x: e.clientX, y: e.clientY, items: list } });
}

export function closeContextMenu() {
  menuStore.set({ menu: null });
}

// Drops empty entries and doubled, leading or trailing separators.
function tidy(items: (MenuEntry | false | null | undefined)[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const item of items) {
    if (!item) continue;
    if ('separator' in item && (!out.length || 'separator' in out[out.length - 1])) continue;
    out.push(item);
  }
  while (out.length && 'separator' in out[out.length - 1]) out.pop();
  return out;
}

const isAction = (e: MenuEntry): e is Extract<MenuEntry, { label: string }> => 'label' in e;

function Panel({ items, x, y, onDone, nested = false }: { items: MenuEntry[]; x: number; y: number; onDone: () => void; nested?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState<{ index: number; x: number; y: number } | null>(null);

  // Keep the panel inside the window; submenus flip left when they would overflow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x;
    let top = y;
    if (left + w > window.innerWidth - 8) left = nested ? x - w - el.parentElement!.offsetWidth + 8 : window.innerWidth - w - 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, left), top });
  }, [x, y, nested]);

  const actions = items.map((it, i) => (isAction(it) && !it.disabled ? i : -1)).filter((i) => i >= 0);

  const openSub = (i: number) => {
    const row = ref.current?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (!row) return;
    const r = row.getBoundingClientRect();
    setOpen({ index: i, x: r.right - 4, y: r.top - 5 });
  };

  const choose = (i: number) => {
    const item = items[i];
    if (!isAction(item) || item.disabled) return;
    if (item.submenu) return openSub(i);
    onDone();
    item.onSelect?.();
  };

  useEffect(() => {
    if (nested) return;
    const onKey = (e: KeyboardEvent) => {
      if (open) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const at = actions.indexOf(active);
        const next = e.key === 'ArrowDown' ? actions[(at + 1) % actions.length] : actions[(at - 1 + actions.length) % actions.length];
        setActive(next ?? -1);
      } else if ((e.key === 'Enter' || e.key === 'ArrowRight') && active >= 0) {
        e.preventDefault();
        e.stopPropagation();
        choose(active);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
      style={{ left: pos.left, top: pos.top, transformOrigin: 'top left' }}
      className="vibrancy fixed z-[90] min-w-[200px] max-w-[280px] rounded-xl border border-line bg-[color-mix(in_srgb,var(--elevated)_92%,transparent)] p-1 shadow-pop dark:border-line-strong"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if ('separator' in item) return <div key={i} className="-mx-1 my-1 h-px bg-line dark:bg-line-strong" />;
        if ('heading' in item) {
          return (
            <div key={i} className="truncate px-2 pb-0.5 pt-1.5 text-[11.5px] font-semibold text-fg-3">
              {item.heading}
            </div>
          );
        }
        const hot = active === i || open?.index === i;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            data-index={i}
            disabled={item.disabled}
            onMouseEnter={() => {
              setActive(i);
              if (item.submenu) openSub(i);
              else setOpen(null);
            }}
            onClick={() => choose(i)}
            className={cx(
              'flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] disabled:opacity-40',
              hot && !item.disabled ? (item.danger ? 'bg-danger text-white' : 'bg-accent text-white') : item.danger ? 'text-danger' : 'text-fg',
            )}
          >
            {item.checked !== undefined && <span className="w-3 text-[12px]">{item.checked ? '✓' : ''}</span>}
            {item.icon && (
              <span className={cx('flex w-4 justify-center [&>svg]:h-[15px] [&>svg]:w-[15px]', hot ? 'text-white' : item.danger ? 'text-danger' : 'text-fg-2')}>
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className={cx('text-[12px]', hot ? 'text-white/80' : 'text-fg-3')}>{item.shortcut}</span>}
            {item.submenu && <ChevronRight className={cx('h-3.5 w-3.5', hot ? 'text-white' : 'text-fg-3')} />}
          </button>
        );
      })}
      {open && isAction(items[open.index]) && (items[open.index] as { submenu?: MenuEntry[] }).submenu && (
        <Panel items={(items[open.index] as { submenu: MenuEntry[] }).submenu} x={open.x} y={open.y} onDone={onDone} nested />
      )}
    </motion.div>
  );
}

/** Mount once. Renders the open context menu and closes it on outside click, scroll, resize or Escape. */
export function ContextMenuHost() {
  const menu = menuStore.use((s) => s.menu);
  useEffect(() => {
    if (!menu) return;
    const close = () => closeContextMenu();
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('[role="menu"]')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [menu]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{menu && <Panel key={`${menu.x}:${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={closeContextMenu} />}</AnimatePresence>,
    document.body,
  );
}
