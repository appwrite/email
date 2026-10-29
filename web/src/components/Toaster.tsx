import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { dismissToast, toastStore } from '~/lib/store';
import { Spinner } from './ui';

// Console-style toasts: a bordered card stacked at the inline end.
export function Toaster() {
  const toasts = toastStore.use((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 no-print sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-lg border border-line bg-elevated px-3.5 py-3 text-[13px] text-fg shadow-pop dark:border-line-strong"
          >
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center">
              {t.tone === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
              {t.tone === 'error' && <AlertCircle className="h-4 w-4 text-danger" />}
              {t.tone === 'progress' && <Spinner size={14} className="text-fg-2" />}
              {(!t.tone || t.tone === 'default') && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t.title}</div>
              {t.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-fg-2">{t.description}</div>}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismissToast(t.id);
                }}
                className="-my-0.5 h-7 shrink-0 rounded-md bg-fg px-2.5 text-[12px] font-medium text-bg transition hover:opacity-90"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="-my-0.5 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-3 transition hover:bg-fill hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
