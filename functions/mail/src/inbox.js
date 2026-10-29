// Email trigger: Appwrite executes this function for every delivery to
// <handle>@inbox-<project>.appwrite.email (or the legacy +inbox form, or a
// connected custom domain). The body is multipart/form-data: an `email` JSON
// part, plus one part per attachment, named by the attachment's id.
import { services } from './lib/appwrite.js';
import { decodeWords, formatAddress, handleFromAddress, parseAddress, parseAddressList } from './lib/address.js';
import { deliver, findMailboxes } from './lib/mail.js';
import { spamVerdict } from './lib/spam.js';

function header(email, name) {
  const v = email.headers?.[name];
  return Array.isArray(v) ? v[0] || '' : v || '';
}

function normalize(email) {
  const from = parseAddress(email.from) || parseAddress(email.envelope?.from) || { name: '', email: '' };
  const refs = header(email, 'references')
    .split(/\s+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const date = email.date ? new Date(email.date) : new Date(email.receivedAt || Date.now());
  return {
    messageId: email.messageId || header(email, 'message-id'),
    inReplyTo: header(email, 'in-reply-to').trim(),
    refs,
    fromName: from.name,
    fromEmail: from.email,
    to: parseAddressList(email.to).map(formatAddress),
    cc: parseAddressList(email.cc).map(formatAddress),
    replyTo: email.replyTo ? (parseAddressList(email.replyTo).map(formatAddress)[0] ?? '') : '',
    subject: decodeWords(email.subject || ''),
    text: email.text || '',
    html: email.html || '',
    date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    size: email.raw?.size || 0,
  };
}

// Attachments arrive in the payload. Content may be base64 text (the default),
// plain text, or a serialised Buffer; a `url` is only a fallback.
function inlineContent(a) {
  const raw = a.content ?? a.data ?? a.base64 ?? a.body;
  if (raw == null) return null;
  if (typeof raw === 'object' && Array.isArray(raw.data)) return Buffer.from(raw.data);
  if (Array.isArray(raw)) return Buffer.from(raw);
  const encoding = String(a.encoding || a.contentEncoding || a.transferEncoding || 'base64').toLowerCase();
  if (encoding === 'base64') return Buffer.from(String(raw).replace(/^data:[^,]*,/, ''), 'base64');
  return Buffer.from(String(raw), encoding === 'utf8' || encoding === 'utf-8' || encoding === 'text' ? 'utf8' : 'latin1');
}

// Reads the multipart body; falls back to a plain JSON body.
async function readBody(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data')) return { email: req.bodyJson, form: null };
  const form = await new Response(req.bodyBinary, { headers: { 'content-type': type } }).formData();
  return { email: JSON.parse(form.get('email')), form };
}

async function readAttachments(email, form, log) {
  const out = [];
  for (const a of email.attachments || []) {
    try {
      const part = form?.get(a.id);
      let buffer = part && typeof part !== 'string' ? Buffer.from(await part.arrayBuffer()) : inlineContent(a);
      if (!buffer && a.url) {
        const res = await fetch(a.url);
        if (!res.ok) throw new Error(`no inline content and the URL returned HTTP ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      }
      if (!buffer) throw new Error('no content in the payload');
      if (a.size && Math.abs(buffer.length - a.size) > 4) log(`Attachment ${a.name}: ${buffer.length} bytes decoded, payload says ${a.size}`);
      out.push({
        name: a.name || part?.name || a.filename || (a.contentType?.startsWith('image/') ? 'image' : 'attachment'),
        contentType: a.contentType || a.type || part?.type,
        contentId: a.contentId || a.cid,
        disposition: a.disposition,
        buffer,
      });
    } catch (e) {
      log(`Skipping attachment ${a.name}: ${e.message}`);
    }
  }
  return out;
}

// One line describing the payload's shape (never its content), so changes to
// the trigger format are easy to spot in the execution logs.
function describe(email, spam) {
  const atts = (email.attachments || []).map((a) =>
    Object.entries(a)
      .map(([k, v]) => `${k}${typeof v === 'string' && v.length > 60 ? `(${v.length})` : ''}`)
      .join(','),
  );
  return `payload keys=${Object.keys(email).join(',')} attachments=[${atts.join(' | ')}] spam=${JSON.stringify(spam)}`;
}

export default async ({ req, res, log, error }) => {
  if (req.headers['x-appwrite-trigger'] !== 'email') {
    return res.json({ ok: false, message: 'This function only accepts email.' }, 400);
  }

  const { email, form } = await readBody(req);
  const recipients = [...(email.envelope?.to || []), req.headers['x-appwrite-email-recipient']].filter(Boolean);
  const handles = [...new Set(recipients.map(handleFromAddress).filter(Boolean))];
  if (!handles.length) {
    log(`No mailbox handle in ${recipients.join(', ')}`);
    return res.empty();
  }

  const svc = services(req.headers['x-appwrite-key']);
  const mailboxes = await findMailboxes(svc.tablesDB, handles);
  if (!mailboxes.length) {
    log(`No mailbox for ${handles.join(', ')}`);
    return res.empty();
  }

  const msg = normalize(email);
  const spam = spamVerdict(req.headers, email);
  log(describe(email, spam));
  const files = await readAttachments(email, form, log);

  for (const mailbox of mailboxes) {
    try {
      await deliver(svc, { mailbox, msg, files, spam, deliveryKey: email.id, log });
    } catch (e) {
      error(`Failed to deliver ${email.id} to ${mailbox.handle}: ${e.message}`);
      throw e;
    }
  }
  return res.empty();
};
