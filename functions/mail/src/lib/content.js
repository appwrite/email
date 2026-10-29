import { createHash } from 'node:crypto';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™' };

export function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function textToHtml(text) {
  return `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

export function snippetOf(text) {
  return text
    .replace(/^>.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

// Normalised subject used to thread replies whose Message-ID chain was lost.
export function topicOf(subject) {
  let s = (subject || '').trim();
  let prev;
  do {
    prev = s;
    s = s.replace(/^\s*(re|fw|fwd|aw|sv|antw|wg|tr)(\[\d+\])?\s*:\s*/i, '');
  } while (s !== prev);
  return s.toLowerCase().replace(/\s+/g, ' ').slice(0, 255);
}

export function isReplySubject(subject) {
  return /^\s*(re|fw|fwd|aw|sv|antw|wg|tr)(\[\d+\])?\s*:/i.test(subject || '');
}

export function searchTextOf({ fromName, fromEmail, to = [], cc = [], subject, text }) {
  return [fromName, fromEmail, ...to, ...cc, subject, (text || '').slice(0, 1200)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 2000);
}

export function hashId(prefix, ...parts) {
  return prefix + createHash('sha1').update(parts.join(':')).digest('hex').slice(0, 32);
}

export function truncate(value, size) {
  if (!value) return '';
  return value.length > size ? value.slice(0, size) : value;
}

// Keeps a value within a mediumtext column (16 MB of UTF-8 bytes).
export function clampBytes(value, bytes = 8 * 1024 * 1024) {
  if (!value) return '';
  if (Buffer.byteLength(value) <= bytes) return value;
  return Buffer.from(value).subarray(0, bytes).toString('utf8');
}
