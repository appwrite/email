import { BUILTIN_DOMAIN, CUSTOM_DOMAINS, INBOX_FUNCTION_ID, MAILBOX_DOMAIN } from './appwrite.js';

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;

export const RESERVED_HANDLES = new Set([
  'abuse', 'admin', 'administrator', 'api', 'appwrite', 'billing', 'help', 'hostmaster', 'inbox',
  'info', 'mailer-daemon', 'noc', 'no-reply', 'noreply', 'postmaster', 'root', 'security',
  'support', 'sysadmin', 'system', 'webmaster', 'www', 'recipients', 'contact',
]);

export function isEmail(value) {
  return typeof value === 'string' && value.length <= 320 && EMAIL_RE.test(value);
}

// Decodes RFC 2047 encoded words (=?utf-8?B?...?= / =?utf-8?Q?...?=) left in headers.
export function decodeWords(value) {
  if (!value || !value.includes('=?')) return value || '';
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, charset, enc, data) => {
      try {
        const bytes =
          enc.toUpperCase() === 'B'
            ? Buffer.from(data, 'base64')
            : Buffer.from(
                data.replace(/_/g, ' ').replace(/=([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
                'latin1',
              );
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return data;
      }
    });
}

// Splits an address list header on commas that are outside quotes and angle brackets.
function splitList(value) {
  const parts = [];
  let current = '';
  let quoted = false;
  let angle = 0;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '<') angle++;
    else if (!quoted && ch === '>') angle = Math.max(0, angle - 1);
    if ((ch === ',' || ch === ';') && !quoted && angle === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseAddress(value) {
  if (!value) return null;
  const raw = decodeWords(String(value).trim());
  const angle = raw.match(/^(.*)<([^>]+)>\s*$/);
  let name = '';
  let email = raw;
  if (angle) {
    name = angle[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').trim();
    email = angle[2].trim();
  }
  email = email.replace(/^mailto:/i, '').trim().toLowerCase();
  if (!isEmail(email)) return null;
  return { name, email };
}

export function parseAddressList(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value.flatMap((v) => splitList(String(v))) : splitList(String(value));
  return items.map(parseAddress).filter(Boolean);
}

export function formatAddress({ name, email }) {
  if (!name || name === email) return email;
  const safe = /[",;<>@()]/.test(name) ? `"${name.replace(/"/g, '\\"')}"` : name;
  return `${safe} <${email}>`;
}

export function mailboxAddress(handle) {
  return `${handle}@${MAILBOX_DOMAIN}`;
}

// Returns the mailbox handle an address delivers to, or null when it is not one of ours.
export function handleFromAddress(address) {
  const email = typeof address === 'string' ? address.toLowerCase() : address?.email;
  if (!email || !email.includes('@')) return null;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  // <handle>@inbox-<project>.appwrite.email; a +tag after the handle still reaches it.
  if (domain === MAILBOX_DOMAIN) return local.split('+')[0] || null;
  // Legacy <handle>+inbox@<project>.appwrite.email.
  if (domain === BUILTIN_DOMAIN) {
    const plus = local.lastIndexOf('+');
    if (plus <= 0) return null;
    if (local.slice(plus + 1) !== INBOX_FUNCTION_ID.toLowerCase()) return null;
    return local.slice(0, plus);
  }
  if (CUSTOM_DOMAINS.includes(domain)) return local.split('+')[0];
  return null;
}
