import { ImageOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHold } from '~/lib/ready-gate';
import { renderEmail } from '~/lib/sanitize';
import { ACCENT, isDark, prefsStore } from '~/lib/store';
import { cx } from './ui';

// Last measured height per message, so reopening a message lays out at its
// final size immediately.
const heights = new Map<string, number>();

// Renders untrusted email HTML in a sandboxed iframe (no scripts) that sizes
// itself to its content and scales down wide newsletters to fit.
export function EmailFrame({
  html,
  text,
  collapseQuotes,
  cacheKey,
}: {
  html?: string;
  text?: string;
  collapseQuotes: boolean;
  cacheKey: string;
}) {
  const prefs = prefsStore.use((s) => s);
  const dark = isDark(prefs);
  const [allowRemote, setAllowRemote] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(() => heights.get(cacheKey) ?? 80);
  const [measured, setMeasured] = useState(false);
  useHold(!measured);

  const rendered = useMemo(
    () =>
      renderEmail(
        { html, text },
        { dark, blockRemote: !prefs.remoteImages && !allowRemote, collapseQuotes, accent: ACCENT },
      ),
    [html, text, dark, prefs.remoteImages, allowRemote, collapseQuotes],
  );

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let loaded = false;
    let inner: ResizeObserver | null = null;
    const measure = () => {
      const doc = frame.contentDocument;
      if (!loaded || !doc?.body) return;
      const width = frame.clientWidth;
      doc.body.style.zoom = '';
      const scroll = doc.documentElement.scrollWidth;
      if (scroll > width + 4 && width > 0) doc.body.style.zoom = String(Math.max(0.45, width / scroll));
      const next = Math.ceil(doc.documentElement.getBoundingClientRect().height || doc.body.scrollHeight) + 2;
      heights.set(cacheKey, next);
      setHeight(next);
      setMeasured(true);
    };
    const onLoad = () => {
      if (loaded) return;
      loaded = true;
      measure();
      const doc = frame.contentDocument;
      if (!doc) return;
      inner = new ResizeObserver(measure);
      inner.observe(doc.body);
      doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
      doc.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', measure));
    };
    frame.addEventListener('load', onLoad);
    // srcdoc can finish loading before this effect attaches the listener.
    if (frame.contentWindow?.location.href === 'about:srcdoc' && frame.contentDocument?.readyState === 'complete') onLoad();
    const outer = new ResizeObserver(measure);
    outer.observe(frame);
    return () => {
      frame.removeEventListener('load', onLoad);
      inner?.disconnect();
      outer.disconnect();
    };
  }, [rendered.html, cacheKey]);

  return (
    <div>
      {rendered.blocked > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-fill px-3 py-2 text-[13px] text-fg-2">
          <ImageOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">Remote content was blocked to protect your privacy.</span>
          <button onClick={() => setAllowRemote(true)} className="font-medium text-accent">
            Load
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title="Message"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={rendered.html}
        style={{ height }}
        className={cx('block w-full border-0', rendered.rich && 'rounded-lg bg-white shadow-[0_0_0_1px_var(--line)]')}
      />
    </div>
  );
}
