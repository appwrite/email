export type Address = { name: string; email: string };

export function parseAddress(value: string): Address {
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: value.trim().toLowerCase() };
}

export function formatAddress(a: Address) {
  if (!a.name || a.name === a.email) return a.email;
  return /[",;<>@()]/.test(a.name) ? `"${a.name.replace(/"/g, '\\"')}" <${a.email}>` : `${a.name} <${a.email}>`;
}

export const isEmail = (v: string) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(v.trim());

export function displayName(a: Address) {
  if (a.name) return a.name;
  const local = a.email.split('@')[0].split('+')[0];
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  ['#ff6482', '#fd366e'],
  ['#ffb340', '#ff9500'],
  ['#5ac8fa', '#007aff'],
  ['#34c759', '#30b0c7'],
  ['#bf5af2', '#7c3aed'],
  ['#ff9f0a', '#ff375f'],
  ['#64d2ff', '#5e5ce6'],
  ['#8e8e93', '#636366'],
];

export function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarGradient(seed: string) {
  const [a, b] = AVATAR_GRADIENTS[hashString(seed) % AVATAR_GRADIENTS.length];
  return `linear-gradient(180deg, ${a}, ${b})`;
}

const FREE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.com', 'zoho.com', 'hey.com', 'fastmail.com',
  'example.com',
]);

export function brandDomain(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || FREE_DOMAINS.has(domain) || domain.endsWith('appwrite.email')) return null;
  const parts = domain.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : domain;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const yearFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Apple Mail style: time today, "Yesterday", weekday this week, then a date.
export function listDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return timeFmt.format(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekdayFmt.format(d);
  if (d.getFullYear() === now.getFullYear()) return shortFmt.format(d);
  return yearFmt.format(d);
}

export function fullDate(iso: string) {
  return fullFmt.format(new Date(iso));
}

export function shortDateTime(iso: string) {
  return longFmt.format(new Date(iso));
}

export function relativeTime(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

export function bytes(n: number) {
  if (!n) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i < 2 ? 0 : 1)} ${units[i]}`;
}

export function stripSubjectPrefix(subject: string) {
  return subject.replace(/^\s*((re|fw|fwd|aw|sv)\s*:\s*)+/i, '');
}

export function replySubject(subject: string) {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${stripSubjectPrefix(subject)}`;
}

export function forwardSubject(subject: string) {
  return `Fwd: ${stripSubjectPrefix(subject)}`;
}

export function escapeHtml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function textToHtml(text: string) {
  return escapeHtml(text)
    .split('\n')
    .map((l) => `<div>${l || '<br>'}</div>`)
    .join('');
}

export async function sha1Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fileIcon(type: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/zip|compressed|tar|gzip/.test(type) || ['zip', 'rar', '7z', 'gz'].includes(ext)) return 'archive';
  if (/sheet|excel|csv/.test(type) || ['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'sheet';
  if (/presentation|powerpoint/.test(type) || ['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (/word|document|text/.test(type) || ['doc', 'docx', 'txt', 'md', 'pages', 'rtf'].includes(ext)) return 'doc';
  return 'file';
}
