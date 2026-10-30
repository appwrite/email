// Scheduled every minute: sends scheduled mail that is due, wakes snoozed
// threads, refreshes delivery status and purges old trash.
import { Query } from 'node-appwrite';
import { DATABASE_ID, TABLES, services } from './lib/appwrite.js';
import { parseAddressList } from './lib/address.js';
import { getRowOrNull, outboundStatus, parseJson, sendMessage } from './lib/mail.js';
import { purgeSendLog } from './lib/limits.js';

const TRASH_RETENTION_DAYS = 30;

async function sendDue(svc, log, error) {
  const now = new Date().toISOString();
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [Query.equal('folder', 'scheduled'), Query.lessThanEqual('scheduledAt', now), Query.limit(25)],
    total: false,
  });
  for (const row of rows) {
    try {
      // Claim the row first so an overlapping run cannot send it twice.
      await svc.tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.messages,
        rowId: row.$id,
        data: { folder: 'sent', status: 'sending' },
      });
      const mailbox = await getRowOrNull(svc.tablesDB, TABLES.mailboxes, row.ownerId);
      if (!mailbox) continue;
      const attachments = parseJson(row.attachments, []);
      await sendMessage(svc, {
        mailbox,
        senderName: row.fromName,
        rowId: row.$id,
        input: {
          to: parseAddressList(row.to),
          cc: parseAddressList(row.cc),
          bcc: parseAddressList(row.bcc),
          subject: row.subject,
          html: row.html,
          attachments: attachments.map((a) => a.id),
          inReplyTo: row.inReplyTo,
          refs: (row.refs || '').split(/\s+/).filter(Boolean),
          threadId: row.threadId,
        },
        files: attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, contentType: a.type })),
        log,
      });
      log(`Sent scheduled ${row.$id}`);
    } catch (e) {
      error(`Scheduled ${row.$id} failed: ${e.message}`);
      await svc.tablesDB
        .updateRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: row.$id, data: { status: 'failed' } })
        .catch(() => {});
    }
  }
  return rows.length;
}

async function wakeSnoozed(svc) {
  const { rows } = await svc.tablesDB.updateRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    data: { folder: 'inbox', read: false, snoozedUntil: null },
    queries: [Query.equal('folder', 'snoozed'), Query.lessThanEqual('snoozedUntil', new Date().toISOString())],
  });
  return rows.length;
}

async function refreshStatuses(svc) {
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [Query.equal('status', 'sending'), Query.isNotNull('outboundId'), Query.limit(50)],
    total: false,
  });
  let changed = 0;
  for (const row of rows) {
    const status = await outboundStatus(svc, row.outboundId);
    if (status && status !== row.status) {
      await svc.tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: row.$id, data: { status } });
      changed++;
    }
  }
  return changed;
}

async function purgeTrash(svc) {
  const before = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const queries = [Query.equal('folder', 'trash'), Query.lessThan('$updatedAt', before)];
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [...queries, Query.select(['$id', 'attachments']), Query.limit(100)],
    total: false,
  });
  if (!rows.length) return 0;
  const fileIds = rows.flatMap((r) => parseJson(r.attachments, []).map((a) => a.id));
  await Promise.allSettled(fileIds.map((fileId) => svc.storage.deleteFile({ bucketId: 'attachments', fileId })));
  await svc.tablesDB.deleteRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [Query.equal('$id', rows.map((r) => r.$id))],
  });
  return rows.length;
}

export default async ({ req, res, log, error }) => {
  const svc = services(req.headers['x-appwrite-key']);
  const report = {};
  for (const [name, job] of Object.entries({ sendDue, wakeSnoozed, refreshStatuses, purgeTrash, purgeSendLog })) {
    try {
      report[name] = await job(svc, log, error);
    } catch (e) {
      error(`${name}: ${e.message}`);
      report[name] = 'error';
    }
  }
  log(JSON.stringify(report));
  return res.json(report);
};
