// HTTP API for signed-in users. The app calls it through
// functions.createExecution, so Appwrite sets x-appwrite-user-id for us.
import { ID, Permission, Query, Role } from 'node-appwrite';
import { BUCKET_ID, DATABASE_ID, TABLES, services } from './lib/appwrite.js';
import { HANDLE_RE, RESERVED_HANDLES, mailboxAddress, parseAddress } from './lib/address.js';
import { htmlToText, searchTextOf, snippetOf, topicOf, truncate } from './lib/content.js';
import { deliver, getRowOrNull, outboundStatus, parseJson, sendMessage } from './lib/mail.js';
import { APP_NAME, welcomeEmail } from './lib/welcome.js';

class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENTS = 10;

function validateHandle(handle) {
  if (!HANDLE_RE.test(handle || '')) {
    return 'Use 2–32 lowercase letters, numbers, dots, dashes or underscores.';
  }
  if (RESERVED_HANDLES.has(handle)) return 'That address is reserved.';
  return null;
}

async function getMailbox(svc, userId) {
  const mailbox = await getRowOrNull(svc.tablesDB, TABLES.mailboxes, userId);
  if (!mailbox) throw new HttpError(404, 'Create your address first.');
  return mailbox;
}

function parseRecipients(list, field) {
  if (!Array.isArray(list)) return [];
  return list.map((value) => {
    const a = parseAddress(value);
    if (!a) throw new HttpError(400, `“${value}” in ${field} is not a valid email address.`);
    return a;
  });
}

// Confirms the user can read every attachment they want to send.
async function loadAttachments(svc, userId, ids) {
  if (!Array.isArray(ids)) return [];
  if (ids.length > MAX_ATTACHMENTS) throw new HttpError(400, `Attach up to ${MAX_ATTACHMENTS} files.`);
  return Promise.all(
    ids.map(async (id) => {
      const file = await svc.storage.getFile({ bucketId: BUCKET_ID, fileId: id });
      if (!file.$permissions.includes(`read("user:${userId}")`)) throw new HttpError(403, `No access to ${file.name}.`);
      return { id: file.$id, name: file.name, size: file.sizeOriginal, contentType: file.mimeType };
    }),
  );
}

function readInput(body) {
  const input = {
    to: parseRecipients(body.to, 'To'),
    cc: parseRecipients(body.cc, 'Cc'),
    bcc: parseRecipients(body.bcc, 'Bcc'),
    subject: truncate(String(body.subject || ''), 998),
    html: String(body.html || ''),
    attachments: Array.isArray(body.attachments) ? body.attachments.map(String) : [],
    inReplyTo: truncate(String(body.inReplyTo || ''), 255),
    refs: Array.isArray(body.refs) ? body.refs.map(String).slice(-20) : [],
    threadId: body.threadId ? truncate(String(body.threadId), 64) : '',
  };
  const count = input.to.length + input.cc.length + input.bcc.length;
  if (!count) throw new HttpError(400, 'Add at least one recipient.');
  if (count > MAX_RECIPIENTS) throw new HttpError(400, `Send to up to ${MAX_RECIPIENTS} recipients at once.`);
  if (input.html.length > 4 * 1024 * 1024) throw new HttpError(413, 'This message is too large.');
  return input;
}

async function senderName(svc, userId, mailbox) {
  const user = await svc.users.get({ userId });
  return user.name || mailbox.name || mailbox.handle;
}

async function forEachRow(svc, tableId, queries, fn) {
  let cursor = null;
  for (;;) {
    const { rows } = await svc.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId,
      queries: [...queries, Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
      total: false,
    });
    for (const row of rows) await fn(row);
    if (rows.length < 100) return;
    cursor = rows[rows.length - 1].$id;
  }
}

async function deleteFilesOf(svc, rows) {
  const ids = rows.flatMap((r) => parseJson(r.attachments, []).map((a) => a.id));
  await Promise.allSettled(ids.map((fileId) => svc.storage.deleteFile({ bucketId: BUCKET_ID, fileId })));
}

const routes = {
  'GET /mailbox/available': async ({ svc, req }) => {
    const handle = String(req.query.handle || '').toLowerCase().trim();
    const reason = validateHandle(handle);
    if (reason) return { available: false, reason, address: mailboxAddress(handle) };
    const { total } = await svc.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.mailboxes,
      queries: [Query.equal('handle', handle), Query.limit(1)],
    });
    return { available: total === 0, reason: total ? 'That address is taken.' : null, address: mailboxAddress(handle) };
  },

  'POST /mailbox': async ({ svc, userId, body, log }) => {
    const existing = await getRowOrNull(svc.tablesDB, TABLES.mailboxes, userId);
    if (existing) return existing;

    const handle = String(body.handle || '').toLowerCase().trim();
    const reason = validateHandle(handle);
    if (reason) throw new HttpError(400, reason);

    const user = await svc.users.get({ userId });
    const name = truncate(String(body.name || user.name || '').trim(), 128);
    if (name && name !== user.name) await svc.users.updateName({ userId, name });

    let mailbox;
    try {
      mailbox = await svc.tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.mailboxes,
        rowId: userId,
        data: { userId, handle, address: mailboxAddress(handle), name },
        permissions: [Permission.read(Role.user(userId))],
      });
    } catch (e) {
      if (e.code === 409) throw new HttpError(409, 'That address is taken.');
      throw e;
    }

    await svc.tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.settings,
      rowId: userId,
      data: { signature: name ? `—\n${name}` : '', vacationEnabled: false, blockedSenders: [], rules: '[]' },
      permissions: [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))],
    });

    const welcome = welcomeEmail({ name, address: mailbox.address });
    await deliver(svc, {
      mailbox,
      msg: {
        messageId: `<welcome.${userId}@appwrite.email>`,
        inReplyTo: '',
        refs: [],
        fromName: APP_NAME,
        fromEmail: 'hello@appwrite.email',
        to: [mailbox.address],
        cc: [],
        replyTo: '',
        subject: welcome.subject,
        html: welcome.html,
        text: htmlToText(welcome.html),
        date: new Date().toISOString(),
        auto: true,
      },
      deliveryKey: `welcome-${userId}`,
      log,
    });
    return mailbox;
  },

  'PATCH /mailbox': async ({ svc, userId, body }) => {
    const mailbox = await getMailbox(svc, userId);
    const name = truncate(String(body.name || '').trim(), 128);
    await svc.users.updateName({ userId, name });
    return svc.tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.mailboxes,
      rowId: mailbox.$id,
      data: { name },
    });
  },

  'POST /send': async ({ svc, userId, body, log }) => {
    const mailbox = await getMailbox(svc, userId);
    const input = readInput(body);
    const files = await loadAttachments(svc, userId, input.attachments);
    const name = await senderName(svc, userId, mailbox);

    if (body.scheduledAt) {
      const at = new Date(body.scheduledAt);
      if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 30_000) {
        throw new HttpError(400, 'Pick a time at least a minute from now.');
      }
      const text = htmlToText(input.html);
      const rowId = ID.unique();
      const row = await svc.tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.messages,
        rowId,
        data: {
          ownerId: userId,
          folder: 'scheduled',
          threadId: input.threadId || rowId,
          inReplyTo: input.inReplyTo,
          refs: input.refs.join(' '),
          fromName: name,
          fromEmail: mailbox.address,
          to: input.to.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)),
          cc: input.cc.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)),
          bcc: input.bcc.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)),
          subject: input.subject,
          snippet: truncate(snippetOf(text), 300),
          text,
          html: input.html,
          date: at.toISOString(),
          scheduledAt: at.toISOString(),
          read: true,
          attachments: JSON.stringify(files.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.contentType }))),
          hasAttachments: files.length > 0,
          status: 'scheduled',
          search: searchTextOf({ fromName: name, fromEmail: mailbox.address, subject: input.subject, text }),
          topic: topicOf(input.subject),
        },
        permissions: [
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ],
      });
      if (body.draftId) await deleteDraft(svc, userId, body.draftId);
      return { message: row, status: 'scheduled' };
    }

    const result = await sendMessage(svc, { mailbox, senderName: name, input, files, log });
    if (body.draftId) await deleteDraft(svc, userId, body.draftId);
    if (result.status === 'failed' && !result.sent) throw new HttpError(502, result.error);
    return { message: result.sent, status: result.status, error: result.error || null };
  },

  // Turns a scheduled message back into a draft.
  'POST /scheduled/cancel': async ({ svc, userId, body }) => {
    const row = await getRowOrNull(svc.tablesDB, TABLES.messages, String(body.id || ''));
    if (!row || row.ownerId !== userId || row.folder !== 'scheduled') throw new HttpError(404, 'Scheduled message not found.');
    const draft = await svc.tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.drafts,
      rowId: ID.unique(),
      data: {
        ownerId: userId,
        to: row.to,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        html: row.html,
        attachments: row.attachments,
        inReplyTo: row.inReplyTo,
        refs: row.refs,
        threadId: row.threadId === row.$id ? '' : row.threadId,
      },
      permissions: [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ],
    });
    await svc.tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: row.$id });
    return { draft };
  },

  // Refreshes delivery status of this user's in-flight messages from Messaging.
  'POST /status': async ({ svc, userId }) => {
    const { rows } = await svc.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.messages,
      queries: [Query.equal('ownerId', userId), Query.equal('status', 'sending'), Query.limit(25)],
      total: false,
    });
    const updated = [];
    for (const row of rows) {
      const status = await outboundStatus(svc, row.outboundId);
      if (status && status !== row.status) {
        await svc.tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: row.$id, data: { status } });
        updated.push({ id: row.$id, status });
      }
    }
    return { updated };
  },

  'POST /trash/empty': async ({ svc, userId }) => {
    const queries = [Query.equal('ownerId', userId), Query.equal('folder', ['trash', 'spam'])];
    const rows = [];
    await forEachRow(svc, TABLES.messages, [...queries, Query.select(['$id', 'attachments'])], (r) => rows.push(r));
    await deleteFilesOf(svc, rows);
    await svc.tablesDB.deleteRows({ databaseId: DATABASE_ID, tableId: TABLES.messages, queries });
    return { deleted: rows.length };
  },

  'POST /account/delete': async ({ svc, userId }) => {
    const owned = [Query.equal('ownerId', userId)];
    const rows = [];
    await forEachRow(svc, TABLES.messages, [...owned, Query.select(['$id', 'attachments'])], (r) => rows.push(r));
    await forEachRow(svc, TABLES.drafts, [...owned, Query.select(['$id', 'attachments'])], (r) => rows.push(r));
    await deleteFilesOf(svc, rows);
    for (const tableId of [TABLES.messages, TABLES.drafts, TABLES.contacts, TABLES.labels]) {
      await svc.tablesDB.deleteRows({ databaseId: DATABASE_ID, tableId, queries: owned });
    }
    for (const tableId of [TABLES.settings, TABLES.mailboxes]) {
      await svc.tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId, rowId: userId }).catch(() => {});
    }
    await svc.users.delete({ userId });
    return { deleted: true };
  },
};

async function deleteDraft(svc, userId, draftId) {
  const draft = await getRowOrNull(svc.tablesDB, TABLES.drafts, String(draftId));
  if (draft && draft.ownerId === userId) {
    await svc.tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.drafts, rowId: draft.$id });
  }
}

export default async ({ req, res, log, error }) => {
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) return res.json({ message: 'Sign in to use this API.' }, 401);

  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  const handler = routes[`${req.method} ${path}`];
  if (!handler) return res.json({ message: `No route for ${req.method} ${path}` }, 404);

  const svc = services(req.headers['x-appwrite-key']);
  try {
    const body = req.method === 'GET' ? {} : req.bodyJson || {};
    const result = await handler({ svc, req, userId, body, log });
    return res.json(result ?? { ok: true });
  } catch (e) {
    const code = e instanceof HttpError ? e.code : e.code >= 400 && e.code < 500 ? e.code : 500;
    if (code >= 500) error(`${req.method} ${path}: ${e.stack || e.message}`);
    return res.json({ message: e.message || 'Something went wrong.' }, code);
  }
};

