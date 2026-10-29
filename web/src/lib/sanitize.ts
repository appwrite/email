import DOMPurify from 'dompurify';
import { escapeHtml } from './format';

export type RenderedEmail = { html: string; blocked: number; rich: boolean };

const RICH_HINT = /bgcolor=|background(-color)?\s*:|<table/i;

function linkify(text: string) {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1">$1</a>')
    .split('\n')
    .map((line) => (/^\s*&gt;/.test(line) ? `<span class="q">${line}</span>` : line))
    .join('\n');
}

const BASE_CSS = (dark: boolean, rich: boolean, accent: string) => `
  :root{color-scheme:${dark && !rich ? 'dark' : 'light'}}
  html,body{margin:0;padding:0;background:transparent}
  body{font:14px/1.6 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif;
    color:${dark && !rich ? '#fafafa' : '#19191c'};background:${rich ? '#ffffff' : 'transparent'};
    word-wrap:break-word;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;padding:${rich ? '16px' : '2px 0 4px'}}
  a{color:${dark && !rich ? accent : '#0066cc'}}
  img{max-width:100%;height:auto}
  pre,code{white-space:pre-wrap;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:13px}
  .plain{white-space:pre-wrap;font-family:inherit;margin:0}
  .plain .q{color:${dark ? '#a1a1aa' : '#71717a'}}
  blockquote{margin:8px 0 8px 2px;padding-left:12px;border-left:2px solid ${dark && !rich ? '#3f4346' : '#d5d5db'};color:${dark && !rich ? '#a1a1aa' : '#52525b'}}
  details.quoted>summary{list-style:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:18px;border-radius:9px;
    background:${dark && !rich ? '#2d2d31' : '#e9e9ec'};color:${dark && !rich ? '#a1a1aa' : '#71717a'};font-size:12px;letter-spacing:1px;cursor:pointer;margin:6px 0}
  details.quoted>summary::-webkit-details-marker{display:none}
  img[data-blocked]{background:${dark && !rich ? '#2d2d31' : '#f4f4f5'};min-width:24px;min-height:24px;outline:1px dashed #8e8e93}
`;

export function renderEmail(
  { html, text }: { html?: string; text?: string },
  opts: { dark: boolean; blockRemote: boolean; collapseQuotes: boolean; accent: string },
): RenderedEmail {
  let blocked = 0;
  const source = html?.trim() ? html : `<pre class="plain">${linkify(text || '')}</pre>`;
  const rich = !!html?.trim() && RICH_HINT.test(html);

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (opts.blockRemote && (el.tagName === 'IMG' || el.tagName === 'IMAGE')) {
      const src = el.getAttribute('src') || '';
      if (/^https?:/i.test(src) && !src.includes('/storage/buckets/')) {
        el.setAttribute('data-blocked', '');
        el.removeAttribute('src');
        el.removeAttribute('srcset');
        blocked++;
      }
    }
    if (opts.blockRemote && el.hasAttribute('background')) el.removeAttribute('background');
  });

  const clean = DOMPurify.sanitize(source, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'base', 'link', 'meta', 'frame', 'frameset'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'formaction'],
    ADD_ATTR: ['target'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  }) as string;
  DOMPurify.removeHook('afterSanitizeAttributes');

  const doc = new DOMParser().parseFromString(clean, 'text/html');
  if (opts.collapseQuotes) {
    const quote =
      doc.querySelector('.gmail_quote, blockquote[type="cite"], #appendonsend, .yahoo_quoted, #divRplyFwdMsg') ||
      [...doc.body.querySelectorAll(':scope > blockquote, :scope > div > blockquote')].pop();
    if (quote && quote.textContent && quote.textContent.trim().length > 40) {
      const details = doc.createElement('details');
      details.className = 'quoted';
      const summary = doc.createElement('summary');
      summary.textContent = '•••';
      summary.title = 'Show quoted text';
      details.appendChild(summary);
      // Pull in the "On … wrote:" attribution line right before the quote.
      const prev = quote.previousElementSibling;
      if (prev && /wrote:|forwarded message/i.test(prev.textContent || '') && (prev.textContent || '').length < 300) {
        details.appendChild(prev);
      }
      quote.replaceWith(details);
      details.appendChild(quote);
    }
  }

  const style = doc.createElement('style');
  style.textContent = BASE_CSS(opts.dark, rich, opts.accent);
  doc.head.prepend(style);
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; img-src ${opts.blockRemote ? "data: cid: https://*.appwrite.io" : 'data: cid: https: http:'}; style-src 'unsafe-inline'${opts.blockRemote ? '' : ' https:'}; font-src https: data: ${typeof location === 'undefined' ? '' : location.origin}; media-src https:`;
  doc.head.prepend(csp);

  return { html: '<!doctype html>' + doc.documentElement.outerHTML, blocked, rich };
}
