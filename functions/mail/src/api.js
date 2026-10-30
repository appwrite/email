// HTTP API for signed-in users. The app calls it through
// functions.createExecution, so Appwrite sets x-appwrite-user-id for us.
import { ID, Permission, Query, Role } from 'node-appwrite';
import { BUCKET_ID, DATABASE_ID, RECIPIENTS_USER_ID, TABLES, services } from './lib/appwrite.js';
import { HANDLE_RE, RESERVED_HANDLES, mailboxAddress, parseAddress } from './lib/address.js';
import { htmlToText, searchTextOf, snippetOf, topicOf, truncate } from './lib/content.js';
import { randomBytes } from 'node:crypto';
import { API_SCOPES, hashKey } from './lib/auth.js';
import { BRANDING_BUCKET_ID, brandOf, getConfig, hasAdminLabel, listAccounts, readBrand, requireAdmin, setAdmin, setConfig, syncUserLimit } from './lib/admin.js';
import { LIMIT_DEFAULTS, checkSendLimits, countRecipients, limitsOf, readLimits, recordSend, usage } from './lib/limits.js';
import { HttpError, getMailbox, loadAttachments, readInput, senderName } from './lib/compose.js';
import { deliver, getRowOrNull, outboundStatus, parseJson, sendMessage } from './lib/mail.js';
import { APP_NAME, welcomeEmail } from './lib/welcome.js';

function validateHandle(handle) {
  if (!HANDLE_RE.test(handle || '')) {
    return 'Use 2–32 lowercase letters, numbers, dots, dashes or underscores.';
  }
  if (RESERVED_HANDLES.has(handle)) return 'That address is reserved.';
  return null;
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

// Creates a mailbox (address, settings and welcome message) for a user.
async function createMailbox(svc, userId, body, log) {
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

    const appName = (await getConfig(svc))?.brandName || APP_NAME;
    const welcome = welcomeEmail({ name, address: mailbox.address, appName });
    await deliver(svc, {
      mailbox,
      msg: {
        messageId: `<welcome.${userId}@appwrite.email>`,
        inReplyTo: '',
        refs: [],
        fromName: appName,
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
}

// Deletes a user with every message, draft, file, contact, label and key.
async function deleteUserData(svc, userId) {
    const owned = [Query.equal('ownerId', userId)];
    const rows = [];
    await forEachRow(svc, TABLES.messages, [...owned, Query.select(['$id', 'attachments'])], (r) => rows.push(r));
    await forEachRow(svc, TABLES.drafts, [...owned, Query.select(['$id', 'attachments'])], (r) => rows.push(r));
    await deleteFilesOf(svc, rows);
    for (const tableId of [TABLES.messages, TABLES.drafts, TABLES.contacts, TABLES.labels, TABLES.apikeys]) {
      await svc.tablesDB.deleteRows({ databaseId: DATABASE_ID, tableId, queries: owned });
    }
    for (const tableId of [TABLES.settings, TABLES.mailboxes]) {
      await svc.tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId, rowId: userId }).catch(() => {});
    }
    await svc.users.delete({ userId });
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
    const config = await getConfig(svc);
    if (!config) {
      // A fresh install: the first person to claim an address becomes the
      // admin, and sign-ups close until they reopen them. Installs that
      // already have mailboxes keep sign-ups open until an admin decides.
      const { total } = await svc.tablesDB.listRows({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, queries: [Query.limit(1)] });
      const first = total === 0;
      await setConfig(svc, { signupsOpen: !first });
      if (first) {
        await setAdmin(svc, await svc.users.get({ userId }), true);
        const mailbox = await createMailbox(svc, userId, body, log);
        await syncUserLimit(svc, false);
        return mailbox;
      }
    } else if (!config.signupsOpen && !hasAdminLabel(await svc.users.get({ userId }))) {
      throw new HttpError(403, 'Sign-ups are closed on this server. Ask an admin to create an account for you.');
    }
    return createMailbox(svc, userId, body, log);
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
    const sending = countRecipients(input);
    await checkSendLimits(svc, userId, sending.recipients);
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
      // Scheduled mail counts when it's scheduled, so it can't dodge the limits.
      await recordSend(svc, userId, sending);
      return { message: row, status: 'scheduled' };
    }

    const result = await sendMessage(svc, { mailbox, senderName: name, input, files, log });
    if (result.sent) await recordSend(svc, userId, sending);
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

  // Personal API key for the public REST API and MCP server. The secret is
  // returned once; only its hash is stored.
  'POST /keys': async ({ svc, userId, body }) => {
    const name = truncate(String(body.name || '').trim(), 64) || 'API key';
    const scopes = (Array.isArray(body.scopes) ? body.scopes : API_SCOPES).filter((s) => API_SCOPES.includes(s));
    if (!scopes.length) throw new HttpError(400, 'Pick at least one permission.');
    const existing = await svc.tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.apikeys,
      queries: [Query.equal('ownerId', userId), Query.limit(1)],
    });
    if (existing.total >= 20) throw new HttpError(400, 'You can have up to 20 keys. Revoke one first.');
    const secret = `mk_${randomBytes(24).toString('base64url')}`;
    const row = await svc.tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.apikeys,
      rowId: ID.unique(),
      data: { ownerId: userId, name, prefix: secret.slice(0, 10), hash: hashKey(secret), scopes },
      permissions: [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))],
    });
    return { key: { ...row, hash: undefined }, secret };
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
    await deleteUserData(svc, userId);
    // Keep sign-ups closed: the user cap follows the user count.
    const config = await getConfig(svc);
    if (config && !config.signupsOpen) await syncUserLimit(svc, false);
    return { deleted: true };
  },

  // --- Admin ----------------------------------------------------------------

  'GET /admin': async ({ svc, userId }) => {
    await requireAdmin(svc, userId);
    const [config, accounts] = await Promise.all([getConfig(svc), listAccounts(svc)]);
    const sent = await Promise.all(accounts.map((a) => usage(svc, a.id)));
    return {
      signupsOpen: !!config?.signupsOpen,
      brand: brandOf(config),
      limits: limitsOf(config),
      limitDefaults: LIMIT_DEFAULTS,
      accounts: accounts.map((a, i) => ({ ...a, sentHour: sent[i].hour, sentDay: sent[i].day })),
    };
  },

  'PATCH /admin/config': async ({ svc, userId, body }) => {
    await requireAdmin(svc, userId);
    const config = await getConfig(svc);
    const patch = { ...readLimits(body), ...readBrand(body) };
    if (typeof body.signupsOpen === 'boolean') patch.signupsOpen = body.signupsOpen;
    if (patch.brandLogo) await svc.storage.getFile({ bucketId: BRANDING_BUCKET_ID, fileId: patch.brandLogo });
    // Write every field, so nothing depends on how a partial upsert behaves.
    const next = await setConfig(svc, { signupsOpen: !!config?.signupsOpen, ...limitsOf(config), ...brandOf(config), ...patch });
    if (typeof body.signupsOpen === 'boolean') await syncUserLimit(svc, body.signupsOpen);
    // A replaced or removed logo is deleted.
    const oldLogo = brandOf(config).brandLogo;
    if (patch.brandLogo !== undefined && oldLogo && oldLogo !== patch.brandLogo) {
      await svc.storage.deleteFile({ bucketId: BRANDING_BUCKET_ID, fileId: oldLogo }).catch(() => {});
    }
    return { signupsOpen: !!next.signupsOpen, limits: limitsOf(next), brand: brandOf(next) };
  },

  // Creates a sign-in and an address for someone, whether or not sign-ups are open.
  'POST /admin/accounts': async ({ svc, userId, body, log }) => {
    await requireAdmin(svc, userId);
    const handle = String(body.handle || '').toLowerCase().trim();
    const reason = validateHandle(handle);
    if (reason) throw new HttpError(400, reason);
    const taken = await svc.tablesDB.listRows({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, queries: [Query.equal('handle', handle), Query.limit(1)] });
    if (taken.total) throw new HttpError(409, 'That address is taken.');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (password.length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
    const name = truncate(String(body.name || '').trim(), 128);
    let user;
    try {
      user = await svc.users.create({ userId: ID.unique(), email, password, name: name || undefined });
    } catch (e) {
      if (e.code === 409) throw new HttpError(409, 'An account with that sign-in email already exists.');
      throw new HttpError(400, e.message);
    }
    try {
      if (body.admin) await setAdmin(svc, user, true);
      await svc.users.updateEmailVerification({ userId: user.$id, emailVerification: true }).catch(() => {});
      await createMailbox(svc, user.$id, { handle, name }, log);
    } catch (e) {
      await svc.users.delete({ userId: user.$id }).catch(() => {});
      throw e;
    }
    const config = await getConfig(svc);
    if (config && !config.signupsOpen) await syncUserLimit(svc, false);
    return { ok: true, userId: user.$id };
  },

  'PATCH /admin/accounts': async ({ svc, userId, body }) => {
    await requireAdmin(svc, userId);
    const targetId = String(body.userId || '');
    if (!targetId || targetId === RECIPIENTS_USER_ID) throw new HttpError(400, 'Pick an account.');
    const target = await svc.users.get({ userId: targetId });
    const self = targetId === userId;
    if (typeof body.admin === 'boolean' && body.admin !== hasAdminLabel(target)) {
      if (self && !body.admin) throw new HttpError(400, 'You can’t remove your own admin access.');
      await setAdmin(svc, target, body.admin);
    }
    if (typeof body.blocked === 'boolean') {
      if (self) throw new HttpError(400, 'You can’t block yourself.');
      await svc.users.updateStatus({ userId: targetId, status: !body.blocked });
      if (body.blocked) await svc.users.deleteSessions({ userId: targetId });
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      const name = truncate(body.name.trim(), 128);
      await svc.users.updateName({ userId: targetId, name });
      await svc.tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, rowId: targetId, data: { name } }).catch(() => {});
    }
    if (typeof body.password === 'string') {
      if (body.password.length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
      await svc.users.updatePassword({ userId: targetId, password: body.password });
      await svc.users.deleteSessions({ userId: targetId });
    }
    if (body.signOut) await svc.users.deleteSessions({ userId: targetId });
    return { ok: true };
  },

  'POST /admin/accounts/delete': async ({ svc, userId, body }) => {
    await requireAdmin(svc, userId);
    const targetId = String(body.userId || '');
    if (!targetId || targetId === RECIPIENTS_USER_ID) throw new HttpError(400, 'Pick an account.');
    if (targetId === userId) throw new HttpError(400, 'Delete your own account from Settings.');
    await deleteUserData(svc, targetId);
    const config = await getConfig(svc);
    if (config && !config.signupsOpen) await syncUserLimit(svc, false);
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

