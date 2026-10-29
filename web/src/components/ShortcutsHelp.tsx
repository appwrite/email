import { X } from 'lucide-react';
import { SHORTCUTS } from '~/lib/shortcuts';
import { uiStore } from '~/lib/store';
import { IconButton, Kbd, Sheet } from './ui';

export function ShortcutsHelp() {
  const open = uiStore.use((s) => s.shortcuts);
  const close = () => uiStore.set({ shortcuts: false });
  return (
    <Sheet open={open} onClose={close} className="max-w-xl" labelledBy="shortcuts-title">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="shortcuts-title" className="font-display font-bold text-[20px] tracking-[-0.01em]">
          Keyboard shortcuts
        </h2>
        <IconButton label="Close" onClick={close}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 p-5 sm:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between py-1.5 text-[14px]">
            <span className="text-[13px] text-fg-2">{label}</span>
            <span className="flex gap-1">
              {keys.split(' ').map((k, i) =>
                k === 'then' || k === '/' ? (
                  <span key={i} className="px-0.5 text-[12px] text-fg-3">
                    {k}
                  </span>
                ) : (
                  <Kbd key={i}>{k}</Kbd>
                ),
              )}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
