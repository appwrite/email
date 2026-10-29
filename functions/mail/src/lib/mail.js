import { ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import {
  BUCKET_ID,
  MAILBOX_DOMAIN,
  DATABASE_ID,
  RECIPIENTS_USER_ID,
  TABLES,
  fileViewUrl,
} from './appwrite.js';
import { formatAddress, handleFromAddress, parseAddress } from './address.js';
import {
  clampBytes,
  escapeHtml,
  hashId,
  htmlToText,
  isReplySubject,
  searchTextOf,
  snippetOf,
  topicOf,
  truncate,
} from './content.js';

const ownerPermissions = (userId) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

export async function getRowOrNull(tablesDB, tableId, rowId) {
  try {
    return await tablesDB.getRow({ databaseId: DATABASE_ID, tableId, rowId });
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

export async function findMailboxes(tablesDB, handles) {
  if (!handles.length) return [];
  const { rows } = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.mailboxes,
    queries: [Query.equal('handle', handles), Query.limit(100)],
  });
  return rows;
}

export function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

// Stores attachment buffers for one mailbox owner and returns their metadata.
// Each file gets a resource token so the app (and sandboxed email HTML) can
// render it with a plain URL.
export async function storeFiles({ storage, tokens }, ownerId, files) {
  const stored = [];
  for (const f of files) {
    const file = await storage.createFile({
      bucketId: BUCKET_ID,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(f.buffer, f.name || 'attachment'),
      permissions: [Permission.read(Role.user(ownerId)), Permission.delete(Role.user(ownerId))],
    });
    const token = await tokens.createFileToken({ bucketId: BUCKET_ID, fileId: file.$id });
    stored.push({
      id: file.$id,
      name: f.name || 'attachment',
      size: file.sizeOriginal ?? f.buffer.length,
      type: f.contentType || file.mimeType || 'application/octet-stream',
      cid: f.contentId || '',
      inline: f.disposition === 'inline' && !!f.contentId,
      token: token.secret,
    });
  }
  return stored;
}

export function rewriteCids(html, attachments) {
  if (!html) return html;
  let out = html;
  for (const a of attachments) {
    if (!a.cid) continue;
    const cid = a.cid.replace(/^<|>$/g, '');
    const url = fileViewUrl(a.id, a.token);
    out = out.split(`cid:${cid}`).join(url);
  }
  return out;
}

export async function downloadFile({ storage }, fileId) {
  const [meta, data] = await Promise.all([
    storage.getFile({ bucketId: BUCKET_ID, fileId }),
    storage.getFileDownload({ bucketId: BUCKET_ID, fileId }),
  ]);
  return { name: meta.name, contentType: meta.mimeType, buffer: Buffer.from(data), disposition: 'attachment' };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function matches(cond, msg) {
  const value = String(cond.value || '').toLowerCase().trim();
  if (!value) return false;
  const haystacks = {
    from: [msg.fromEmail, msg.fromName],
    to: [...(msg.to || []), ...(msg.cc || [])],
    subject: [msg.subject],
    body: [msg.text],
  }[cond.field] || [msg.subject];
  return haystacks.some((h) => {
    const s = String(h || '').toLowerCase();
    switch (cond.op) {
      case 'equals':
        return s === value;
      case 'startsWith':
        return s.startsWith(value);
      case 'endsWith':
        return s.endsWith(value);
      default:
        return s.includes(value);
    }
  });
}

export function applyRules(rules, msg) {
  const result = { folder: null, labels: [], read: false, starred: false };
  for (const rule of rules || []) {
    if (rule.enabled === false || !rule.conditions?.length) continue;
    const ok =
      rule.match === 'any' ? rule.conditions.some((c) => matches(c, msg)) : rule.conditions.every((c) => matches(c, msg));
    if (!ok) continue;
    const a = rule.actions || {};
    if (a.folder) result.folder = a.folder;
    if (a.label) result.labels.push(a.label);
    if (a.read) result.read = true;
    if (a.star) result.starred = true;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Delivery into a mailbox
// ---------------------------------------------------------------------------

async function resolveThread(tablesDB, ownerId, msg) {
  const ids = [msg.inReplyTo, ...(msg.refs || [])].filter(Boolean).map((v) => truncate(v, 255));
  if (ids.length) {
    const { rows } = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.messages,
      queries: [
        Query.equal('ownerId', ownerId),
        Query.equal('messageId', ids.slice(-20)),
        Query.select(['threadId']),
        Query.limit(1),
      ],
      total: false,
    });
    if (rows[0]) return rows[0].threadId;
  }
  if (isReplySubject(msg.subject)) {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { rows } = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.messages,
      queries: [
        Query.equal('ownerId', ownerId),
        Query.equal('topic', topicOf(msg.subject)),
        Query.greaterThan('date', since),
        Query.orderDesc('date'),
        Query.select(['threadId']),
        Query.limit(1),
      ],
      total: false,
    });
    if (rows[0]) return rows[0].threadId;
  }
  return null;
}

/**
 * Delivers a normalised message into one mailbox. `deliveryKey` makes the
 * operation idempotent: a retried execution resolves to the same row ID.
 */
export async function deliver(svc, { mailbox, msg, files = [], spam = null, deliveryKey, log = () => {} }) {
  const { tablesDB } = svc;
  const ownerId = mailbox.userId;
  const rowId = hashId('m', deliveryKey, ownerId);
  if (await getRowOrNull(tablesDB, TABLES.messages, rowId)) {
    log(`Delivery ${deliveryKey} already stored for ${mailbox.handle}`);
    return null;
  }

  const settings = (await getRowOrNull(tablesDB, TABLES.settings, ownerId)) || {};
  const blocked = (settings.blockedSenders || []).some((b) => {
    const v = b.toLowerCase();
    return v.startsWith('@') ? msg.fromEmail.endsWith(v) : msg.fromEmail === v;
  });
  const rule = applyRules(parseJson(settings.rules, []), msg);
  // Junk unless the user knows the sender or a rule already decided the folder.
  const knownSender =
    spam?.isSpam && !!(await getRowOrNull(tablesDB, TABLES.contacts, hashId('c', ownerId, msg.fromEmail)));
  const junk = !!spam?.isSpam && !knownSender && !rule.folder;
  const folder = blocked ? 'trash' : rule.folder || (junk ? 'spam' : 'inbox');
  if (spam?.isSpam) log(`Spam verdict for ${mailbox.handle}: ${spam.reason || 'flagged'}${knownSender ? ' (known contact, kept in Inbox)' : ''}`);

  const threadId = (await resolveThread(tablesDB, ownerId, msg)) || rowId;
  const attachments = await storeFiles(svc, ownerId, files);
  const html = clampBytes(rewriteCids(msg.html, attachments));
  const text = clampBytes(msg.text || htmlToText(msg.html));

  const row = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    rowId,
    data: {
      ownerId,
      folder,
      threadId,
      messageId: truncate(msg.messageId, 255),
      inReplyTo: truncate(msg.inReplyTo, 255),
      refs: (msg.refs || []).join(' ').slice(0, 60000),
      fromName: truncate(msg.fromName, 256),
      fromEmail: truncate(msg.fromEmail, 320),
      to: (msg.to || []).slice(0, 100).map((v) => truncate(v, 512)),
      cc: (msg.cc || []).slice(0, 100).map((v) => truncate(v, 512)),
      bcc: [],
      replyTo: truncate(msg.replyTo, 512),
      subject: truncate(msg.subject, 1000),
      snippet: truncate(snippetOf(text), 300),
      text,
      html,
      date: msg.date || new Date().toISOString(),
      read: rule.read,
      starred: rule.starred,
      labels: rule.labels.slice(0, 20),
      attachments: JSON.stringify(attachments),
      hasAttachments: attachments.some((a) => !a.inline),
      spamScore: typeof spam?.score === 'number' ? spam.score : null,
      // Kept for spam and for unsure verdicts, so the app can flag the latter.
      spamReason: spam?.isSpam || spam?.level === 'unsure' ? truncate(spam.reason || 'Flagged by the spam filter', 200) : '',
      size: msg.size || Buffer.byteLength(html || text || ''),
      deliveryId: truncate(deliveryKey, 64),
      status: 'received',
      search: searchTextOf({ ...msg, text }),
      topic: topicOf(msg.subject),
    },
    permissions: ownerPermissions(ownerId),
  });
  log(`Delivered ${rowId} to ${mailbox.handle} (${folder})`);

  if (!blocked && folder !== 'spam') {
    await Promise.allSettled([
      autoReply(svc, { mailbox, settings, msg, log }),
      autoForward(svc, { mailbox, settings, msg, attachments, log }),
    ]);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

// Messaging delivers to targets, so every external address gets one on a
// dedicated, login-less user. A registered user's own email target is reused.
export async function ensureTarget({ users }, email) {
  const targetId = hashId('t', email);
  try {
    await users.createTarget({ userId: RECIPIENTS_USER_ID, targetId, providerType: 'email', identifier: email });
    return targetId;
  } catch (e) {
    if (e.code !== 409) throw e;
  }
  try {
    await users.getTarget({ userId: RECIPIENTS_USER_ID, targetId });
    return targetId;
  } catch {
    // identifier belongs to another user
  }
  const { users: found } = await users.list({ queries: [Query.equal('email', email), Query.limit(1)] });
  const target = found[0]?.targets?.find((t) => t.providerType === 'email' && t.identifier === email);
  if (target) return target.$id;
  throw new Error(`Could not resolve a messaging target for ${email}`);
}

export async function sendExternal(svc, { to, cc = [], bcc = [], subject, html, fileIds = [], replyToEmail, replyToName }) {
  const resolve = (list) => Promise.all(list.map((a) => ensureTarget(svc, a.email)));
  const [toTargets, ccTargets, bccTargets] = await Promise.all([resolve(to), resolve(cc), resolve(bcc)]);
  return svc.messaging.createEmail({
    messageId: ID.unique(),
    subject: subject || '(no subject)',
    content: html,
    html: true,
    targets: toTargets,
    cc: ccTargets,
    bcc: bccTargets,
    attachments: fileIds.map((id) => `${BUCKET_ID}:${id}`),
    replyToEmail,
    replyToName,
  });
}

export function wrapHtml(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f">${body}</body></html>`;
}

// Messaging accepts up to 64,230 characters of content. Long replies drop the
// quoted history first, then fall back to plain text.
export function fitContent(html) {
  const LIMIT = 64000;
  let out = wrapHtml(html);
  if (out.length <= LIMIT) return out;
  out = wrapHtml(html.replace(/<blockquote[\s\S]*<\/blockquote>/i, '<p style="color:#86868b">[Earlier messages trimmed]</p>'));
  if (out.length <= LIMIT) return out;
  out = wrapHtml(html.replace(/\s(style|class)="[^"]*"/gi, ''));
  if (out.length <= LIMIT) return out;
  return wrapHtml(`<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(htmlToText(html)).slice(0, LIMIT - 1000)}</pre>`);
}

export async function touchContacts({ tablesDB }, ownerId, addresses) {
  const now = new Date().toISOString();
  await Promise.allSettled(
    addresses.map(async (a) => {
      const rowId = hashId('c', ownerId, a.email);
      const existing = await getRowOrNull(tablesDB, TABLES.contacts, rowId);
      if (existing) {
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.contacts,
          rowId,
          data: {
            lastContactedAt: now,
            timesContacted: (existing.timesContacted || 0) + 1,
            ...(existing.name ? {} : a.name ? { name: truncate(a.name, 128) } : {}),
          },
        });
      } else {
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.contacts,
          rowId,
          data: { ownerId, email: a.email, name: truncate(a.name, 128), lastContactedAt: now, timesContacted: 1 },
          permissions: ownerPermissions(ownerId),
        });
      }
    }),
  );
}

/**
 * Sends a message from a mailbox: delivers instantly to Appwrite Email
 * mailboxes, hands external recipients to Messaging, and files a copy in Sent.
 */
export async function sendMessage(
  svc,
  { mailbox, senderName, input, files = [], storeSent = true, rowId: existingRowId = null, log = () => {} },
) {
  const { tablesDB } = svc;
  const all = [...input.to, ...input.cc, ...input.bcc];
  const localHandles = [...new Set(all.map(handleFromAddress).filter(Boolean))];
  const localMailboxes = await findMailboxes(tablesDB, localHandles);
  const localSet = new Set(localMailboxes.map((m) => m.handle));
  const isExternal = (a) => !localSet.has(handleFromAddress(a));
  const external = {
    to: input.to.filter(isExternal),
    cc: input.cc.filter(isExternal),
    bcc: input.bcc.filter(isExternal),
  };
  const unknownLocal = all.filter((a) => handleFromAddress(a) && !localSet.has(handleFromAddress(a)));
  if (unknownLocal.length) {
    throw Object.assign(new Error(`No mailbox for ${unknownLocal.map((a) => a.email).join(', ')}`), { code: 400 });
  }

  const from = { name: senderName, email: mailbox.address };
  const rowId = existingRowId || ID.unique();
  const messageId = `<${rowId}.${Date.now().toString(36)}@${MAILBOX_DOMAIN}>`;
  const html = input.html || '';
  const text = htmlToText(html);
  const date = new Date().toISOString();
  const refs = [...(input.refs || []), input.inReplyTo].filter(Boolean).slice(-20);

  let outbound = null;
  let status = 'sent';
  let error = '';
  if (external.to.length + external.cc.length + external.bcc.length > 0) {
    if (!external.to.length) {
      external.to = external.cc.length ? external.cc.splice(0, 1) : external.bcc.splice(0, 1);
    }
    try {
      outbound = await sendExternal(svc, {
        ...external,
        subject: input.subject,
        html: fitContent(html),
        fileIds: input.attachments || [],
        replyToEmail: mailbox.address,
        replyToName: senderName || mailbox.handle,
      });
      status = 'sending';
    } catch (e) {
      log(`Messaging failed: ${e.message}`);
      status = 'failed';
      error = e.message;
    }
  }

  const msg = {
    messageId,
    inReplyTo: input.inReplyTo || '',
    refs,
    fromName: senderName,
    fromEmail: mailbox.address,
    to: input.to.map(formatAddress),
    cc: input.cc.map(formatAddress),
    replyTo: '',
    subject: input.subject,
    text,
    html,
    date,
    auto: !!input.auto,
  };

  // Instant delivery between Appwrite Email mailboxes.
  if (localMailboxes.length) {
    for (const f of files) {
      if (!f.buffer) f.buffer = (await downloadFile(svc, f.id)).buffer;
    }
    for (const target of localMailboxes) {
      await deliver(svc, { mailbox: target, msg, files, deliveryKey: rowId, log });
    }
  }

  let sent = null;
  if (storeSent) {
    const sentAttachments = await Promise.all(
      (input.attachments || []).map(async (id, i) => {
        const token = await svc.tokens.createFileToken({ bucketId: BUCKET_ID, fileId: id });
        const f = files.find((file) => file.id === id) || files[i];
        return {
          id,
          name: f?.name || 'attachment',
          size: f?.size || f?.buffer?.length || 0,
          type: f?.contentType || 'application/octet-stream',
          cid: '',
          inline: false,
          token: token.secret,
        };
      }),
    );
    const data = {
      ownerId: mailbox.userId,
      folder: 'sent',
      threadId: input.threadId || rowId,
      messageId,
      inReplyTo: truncate(input.inReplyTo, 255),
      refs: refs.join(' '),
      fromName: truncate(senderName, 256),
      fromEmail: mailbox.address,
      to: msg.to,
      cc: msg.cc,
      bcc: input.bcc.map(formatAddress),
      subject: truncate(input.subject, 1000),
      snippet: truncate(snippetOf(text), 300),
      text: clampBytes(text),
      html: clampBytes(html),
      date,
      read: true,
      starred: false,
      labels: [],
      attachments: JSON.stringify(sentAttachments),
      hasAttachments: sentAttachments.length > 0,
      size: Buffer.byteLength(html),
      deliveryId: rowId,
      status,
      outboundId: outbound?.$id || '',
      search: searchTextOf({ ...msg, text }),
      topic: topicOf(input.subject),
    };
    sent = existingRowId
      ? await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId, data: { ...data, scheduledAt: null } })
      : await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.messages,
          rowId,
          data,
          permissions: ownerPermissions(mailbox.userId),
        });
    await touchContacts(
      svc,
      mailbox.userId,
      [...input.to, ...input.cc, ...input.bcc].filter((a) => a.email !== mailbox.address),
    );
  }

  return { sent, status, error, outboundId: outbound?.$id || null };
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

const AUTOMATED_SENDER = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|notifications?)@/i;

async function autoReply(svc, { mailbox, settings, msg, log }) {
  if (!settings.vacationEnabled || msg.auto) return;
  if (settings.vacationUntil && new Date(settings.vacationUntil) < new Date()) return;
  const reply = parseAddress(msg.replyTo) || { name: msg.fromName, email: msg.fromEmail };
  if (!reply.email || AUTOMATED_SENDER.test(reply.email)) return;
  if (handleFromAddress(reply.email) === mailbox.handle) return;

  const history = parseJson(settings.vacationLog, {});
  const last = history[reply.email];
  if (last && Date.now() - last < 4 * 24 * 3600 * 1000) return;

  // Record the reply before sending so two mailboxes on vacation cannot ping-pong.
  history[reply.email] = Date.now();
  const trimmed = Object.fromEntries(
    Object.entries(history)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 300),
  );
  await svc.tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.settings,
    rowId: mailbox.userId,
    data: { vacationLog: JSON.stringify(trimmed) },
  });

  const subject = settings.vacationSubject || `Re: ${msg.subject || ''}`.trim();
  const body = (settings.vacationMessage || 'I am currently away and will reply when I return.')
    .split('\n')
    .map((l) => escapeHtml(l))
    .join('<br>');
  await sendMessage(svc, {
    mailbox,
    senderName: mailbox.name || mailbox.handle,
    input: {
      to: [reply],
      cc: [],
      bcc: [],
      subject,
      html: `<div>${body}</div>`,
      inReplyTo: msg.messageId,
      refs: msg.refs,
      attachments: [],
      auto: true,
    },
    storeSent: false,
    log,
  });
  log(`Auto-replied to ${reply.email}`);
}

async function autoForward(svc, { mailbox, settings, msg, attachments, log }) {
  const target = parseAddress(settings.forwardTo);
  if (!target || handleFromAddress(target.email) === mailbox.handle) return;
  const header = `<div style="color:#6e6e73;font-size:13px;border-left:3px solid #d2d2d7;padding-left:12px;margin:0 0 16px">
    Forwarded from ${escapeHtml(mailbox.address)}<br>
    From: ${escapeHtml(formatAddress({ name: msg.fromName, email: msg.fromEmail }))}<br>
    Subject: ${escapeHtml(msg.subject)}</div>`;
  await sendExternal(svc, {
    to: [target],
    subject: msg.subject,
    html: wrapHtml(header + (msg.html || `<pre>${escapeHtml(msg.text)}</pre>`)),
    fileIds: attachments.filter((a) => !a.inline).map((a) => a.id),
    replyToEmail: msg.fromEmail,
    replyToName: msg.fromName,
  });
  log(`Forwarded to ${target.email}`);
}

export async function outboundStatus(svc, outboundId) {
  if (!outboundId) return null;
  try {
    const m = await svc.messaging.getMessage({ messageId: outboundId });
    if (m.status === 'sent') return 'sent';
    if (m.status === 'failed') return 'failed';
    return 'sending';
  } catch {
    return null;
  }
}
