// Mailbox operations behind the public REST API and the MCP server. Every
// call is scoped to one user: rows are always filtered by ownerId.
import { Query } from 'node-appwrite';
import { DATABASE_ID, TABLES, fileDownloadUrl } from './appwrite.js';
import { escapeHtml, truncate } from './content.js';
import { HttpError, getMailbox, loadAttachments, readInput, senderName } from './compose.js';
import { getRowOrNull, parseJson, sendMessage } from './mail.js';
import { checkSendLimits, countRecipients, recordSend } from './limits.js';

export const LIST_FOLDERS = ['inbox', 'starred', 'snoozed', 'sent', 'scheduled', 'archive', 'spam', 'trash', 'all'];
export const MOVE_FOLDERS = ['inbox', 'archive', 'spam', 'trash'];

const SUMMARY_COLUMNS = [
  '$id', 'threadId', 'folder', 'fromName', 'fromEmail', 'to', 'cc', 'subject', 'snippet', 'date',
  'read', 'starred', 'labels', 'hasAttachments', 'status', 'spamReason',
];

const address = (name, email) => (name && name !== email ? `${name} <${email}>` : email);

function summary(row) {
  return {
    id: row.$id,
    threadId: row.threadId,
    folder: row.folder,
    from: address(row.fromName, row.fromEmail),
    to: row.to || [],
    cc: row.cc || [],
    subject: row.subject || '',
    snippet: row.snippet || '',
    date: row.date,
    read: !!row.read,
    starred: !!row.starred,
    labels: row.labels || [],
    hasAttachments: !!row.hasAttachments,
    ...(row.status && row.status !== 'received' ? { status: row.status } : {}),
    ...(row.spamReason ? { possibleSpam: true } : {}),
  };
}

function full(row, { html = false } = {}) {
  return {
    ...summary(row),
    replyTo: row.replyTo || null,
    messageId: row.messageId || null,
    text: row.text || '',
    ...(html ? { html: row.html || '' } : {}),
    attachments: parseJson(row.attachments, [])
      .filter((a) => !a.inline)
      .map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, url: a.token ? fileDownloadUrl(a.id, a.token) : null })),
  };
}

async function ownRow(svc, userId, id) {
  const row = await getRowOrNull(svc.tablesDB, TABLES.messages, String(id || ''));
  if (!row || row.ownerId !== userId) throw new HttpError(404, `No message with ID ${id}.`);
  return row;
}

export async function me(svc, userId) {
  const mailbox = await getMailbox(svc, userId);
  const name = await senderName(svc, userId, mailbox);
  const count = async (queries) =>
    (
      await svc.tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.messages,
        queries: [Query.equal('ownerId', userId), ...queries, Query.limit(1), Query.select(['$id'])],
      })
    ).total;
  const [unread, total] = await Promise.all([
    count([Query.equal('folder', 'inbox'), Query.equal('read', false)]),
    count([Query.equal('folder', 'inbox')]),
  ]);
  return { userId, name, address: mailbox.address, handle: mailbox.handle, inbox: { total, unread } };
}

export async function listMessages(svc, userId, opts = {}) {
  const folder = opts.folder || 'inbox';
  if (!LIST_FOLDERS.includes(folder)) throw new HttpError(400, `folder must be one of ${LIST_FOLDERS.join(', ')}.`);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const q = [Query.equal('ownerId', userId)];
  if (folder === 'starred') q.push(Query.equal('starred', true), Query.notEqual('folder', 'trash'), Query.notEqual('folder', 'spam'));
  else if (folder === 'all') q.push(Query.equal('folder', ['inbox', 'archive', 'sent']));
  else q.push(Query.equal('folder', folder));
  if (opts.unread) q.push(Query.equal('read', false));
  if (opts.starred && folder !== 'starred') q.push(Query.equal('starred', true));
  if (opts.label) q.push(Query.contains('labels', [String(opts.label)]));
  if (opts.query) q.push(Query.search('search', String(opts.query).slice(0, 200)));
  const { rows, total } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [
      ...q,
      Query.select(SUMMARY_COLUMNS),
      Query.orderDesc('date'),
      Query.limit(limit),
      ...(opts.cursor ? [Query.cursorAfter(String(opts.cursor))] : []),
    ],
  });
  return {
    total,
    messages: rows.map(summary),
    nextCursor: rows.length === limit ? rows[rows.length - 1].$id : null,
  };
}

export async function getMessage(svc, userId, id, opts = {}) {
  const row = await ownRow(svc, userId, id);
  if (opts.markRead && !row.read) {
    await svc.tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: row.$id, data: { read: true } });
    row.read = true;
  }
  return full(row, opts);
}

export async function getThread(svc, userId, threadId, opts = {}) {
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [Query.equal('ownerId', userId), Query.equal('threadId', String(threadId || '')), Query.orderAsc('date'), Query.limit(100)],
  });
  if (!rows.length) throw new HttpError(404, `No thread with ID ${threadId}.`);
  return { threadId, subject: rows[0].subject || '', messages: rows.map((r) => full(r, opts)) };
}

export async function listLabels(svc, userId) {
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.labels,
    queries: [Query.equal('ownerId', userId), Query.orderAsc('name'), Query.limit(100)],
  });
  return { labels: rows.map((l) => ({ id: l.$id, name: l.name, color: l.color })) };
}

export async function updateMessages(svc, userId, ids, changes = {}) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Pass the message IDs to update.');
  if (ids.length > 100) throw new HttpError(400, 'Update up to 100 messages at once.');
  const data = {};
  if (typeof changes.read === 'boolean') data.read = changes.read;
  if (typeof changes.starred === 'boolean') data.starred = changes.starred;
  if (changes.folder !== undefined) {
    if (!MOVE_FOLDERS.includes(changes.folder)) throw new HttpError(400, `folder must be one of ${MOVE_FOLDERS.join(', ')}.`);
    data.folder = changes.folder;
    data.snoozedUntil = null;
  }
  const addLabels = [].concat(changes.addLabels || []).map(String);
  const removeLabels = [].concat(changes.removeLabels || []).map(String);
  if (!Object.keys(data).length && !addLabels.length && !removeLabels.length) {
    throw new HttpError(400, 'Nothing to change: pass read, starred, folder, addLabels or removeLabels.');
  }
  const rows = await Promise.all(ids.map((id) => ownRow(svc, userId, id)));
  const updated = await Promise.all(
    rows.map((row) => {
      const labels = new Set(row.labels || []);
      addLabels.forEach((l) => labels.add(l));
      removeLabels.forEach((l) => labels.delete(l));
      return svc.tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.messages,
        rowId: row.$id,
        data: { ...data, ...(addLabels.length || removeLabels.length ? { labels: [...labels] } : {}) },
      });
    }),
  );
  return { updated: updated.map(summary) };
}

const textToHtml = (text) =>
  `<div>${escapeHtml(String(text))
    .split(/\r?\n/)
    .map((l) => l || '<br>')
    .join('</div><div>')}</div>`;

const replySubject = (s) => (/^re:/i.test(s || '') ? s : `Re: ${s || ''}`.trim());

/**
 * Sends a new message, or a reply when `replyTo` names a message ID. Plain
 * `text` is converted to HTML; pass `html` to send rich content instead.
 */
export async function send(svc, userId, body = {}, log) {
  const mailbox = await getMailbox(svc, userId);
  const name = await senderName(svc, userId, mailbox);
  let thread = {};
  let to = body.to;
  let cc = body.cc;
  let subject = body.subject;
  if (body.replyTo) {
    const original = await ownRow(svc, userId, body.replyTo);
    const own = (a) => String(a).toLowerCase().includes(mailbox.address.toLowerCase());
    const sender = original.replyTo || address(original.fromName, original.fromEmail);
    const outgoing = original.folder === 'sent' || own(original.fromEmail);
    if (!to?.length) to = outgoing ? original.to : [sender];
    if (!cc?.length && body.replyAll) cc = [...(outgoing ? [] : original.to || []), ...(original.cc || [])].filter((a) => !own(a));
    if (!subject) subject = replySubject(original.subject);
    thread = {
      inReplyTo: original.messageId || '',
      refs: [...String(original.refs || '').split(/\s+/).filter(Boolean), original.messageId].filter(Boolean),
      threadId: original.threadId,
    };
  }
  const html = body.html ? String(body.html) : textToHtml(body.text ?? body.body ?? '');
  if (!subject && !body.replyTo) throw new HttpError(400, 'Add a subject.');
  const input = readInput({ to, cc, bcc: body.bcc, subject: truncate(String(subject || ''), 998), html, attachments: body.attachments, ...thread });
  const sending = countRecipients(input);
  await checkSendLimits(svc, userId, sending.recipients);
  const files = await loadAttachments(svc, userId, input.attachments);
  const result = await sendMessage(svc, { mailbox, senderName: name, input, files, log });
  if (result.sent) await recordSend(svc, userId, sending);
  if (result.status === 'failed' && !result.sent) throw new HttpError(502, result.error || 'Sending failed.');
  return { status: result.status, message: result.sent ? summary(result.sent) : null, error: result.error || null };
}
