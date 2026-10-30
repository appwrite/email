// Provisions every Appwrite resource the app needs. Safe to re-run: existing
// resources are left alone (409s are ignored) so it doubles as a migration.
//
//   APPWRITE_API_KEY=... node scripts/setup.mjs
import {
  Client,
  TablesDB,
  Storage,
  Permission,
  Role,
  TablesDBIndexType,
  OrderBy,
  Compression,
  Query,
} from 'node-appwrite';
import { ENDPOINT, PROJECT_ID, DATABASE_ID, BUCKET_ID, TABLES } from './config.mjs';

const key = process.env.APPWRITE_API_KEY;
if (!key) {
  console.error('Set APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(key);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

async function ensure(label, fn) {
  try {
    await fn();
    console.log(`  + ${label}`);
  } catch (e) {
    if (e.code === 409) return console.log(`  = ${label}`);
    console.error(`  ! ${label}: ${e.message}`);
    throw e;
  }
}

const str = (key, size, opts = {}) => ({ kind: 'varchar', key, size, ...opts });
const text = (key, opts = {}) => ({ kind: 'text', key, ...opts });
const medium = (key, opts = {}) => ({ kind: 'mediumtext', key, ...opts });
const bool = (key, xdefault = false) => ({ kind: 'boolean', key, xdefault });
const date = (key, opts = {}) => ({ kind: 'datetime', key, ...opts });
const int = (key, opts = {}) => ({ kind: 'integer', key, ...opts });
const float = (key, opts = {}) => ({ kind: 'float', key, ...opts });

const schema = {
  [TABLES.mailboxes]: {
    name: 'Mailboxes',
    permissions: [],
    columns: [
      str('userId', 36, { required: true }),
      str('handle', 32, { required: true }),
      str('address', 320, { required: true }),
      str('name', 128),
    ],
    indexes: [
      { key: 'u_handle', type: 'unique', columns: ['handle'] },
      { key: 'u_user', type: 'unique', columns: ['userId'] },
    ],
  },
  [TABLES.settings]: {
    name: 'Settings',
    permissions: [],
    columns: [
      text('signature'),
      bool('vacationEnabled'),
      str('vacationSubject', 255),
      text('vacationMessage'),
      date('vacationUntil'),
      str('blockedSenders', 320, { array: true }),
      text('rules'),
      str('forwardTo', 320),
      text('vacationLog'),
    ],
    indexes: [],
  },
  [TABLES.messages]: {
    name: 'Messages',
    permissions: [],
    columns: [
      str('ownerId', 36, { required: true }),
      str('folder', 16, { required: true }),
      str('threadId', 64, { required: true }),
      str('messageId', 255),
      str('inReplyTo', 255),
      text('refs'),
      str('fromName', 256),
      str('fromEmail', 320),
      str('to', 512, { array: true }),
      str('cc', 512, { array: true }),
      str('bcc', 512, { array: true }),
      str('replyTo', 512),
      str('subject', 1000),
      str('snippet', 300),
      medium('text'),
      medium('html'),
      date('date', { required: true }),
      bool('read'),
      bool('starred'),
      str('labels', 64, { array: true }),
      text('attachments'),
      bool('hasAttachments'),
      int('size'),
      str('deliveryId', 64),
      str('status', 16),
      str('outboundId', 36),
      date('scheduledAt'),
      date('snoozedUntil'),
      str('search', 2000),
      str('topic', 255),
      float('spamScore'),
      str('spamReason', 200),
    ],
    indexes: [
      { key: 'k_owner_folder_date', type: 'key', columns: ['ownerId', 'folder', 'date'], orders: ['asc', 'asc', 'desc'] },
      { key: 'k_owner_date', type: 'key', columns: ['ownerId', 'date'], orders: ['asc', 'desc'] },
      { key: 'k_owner_thread', type: 'key', columns: ['ownerId', 'threadId'] },
      { key: 'k_owner_msgid', type: 'key', columns: ['ownerId', 'messageId'], lengths: [36, 191] },
      { key: 'k_owner_starred', type: 'key', columns: ['ownerId', 'starred', 'date'], orders: ['asc', 'asc', 'desc'] },
      { key: 'k_owner_unread', type: 'key', columns: ['ownerId', 'folder', 'read'] },
      { key: 'k_folder_snooze', type: 'key', columns: ['folder', 'snoozedUntil'] },
      { key: 'k_folder_sched', type: 'key', columns: ['folder', 'scheduledAt'] },
      { key: 'k_owner_topic', type: 'key', columns: ['ownerId', 'topic'], lengths: [36, 191] },
      { key: 'ft_search', type: 'fulltext', columns: ['search'] },
    ],
  },
  [TABLES.drafts]: {
    name: 'Drafts',
    permissions: [Permission.create(Role.users())],
    columns: [
      str('ownerId', 36, { required: true }),
      str('to', 512, { array: true }),
      str('cc', 512, { array: true }),
      str('bcc', 512, { array: true }),
      str('subject', 1000),
      medium('html'),
      text('attachments'),
      str('inReplyTo', 255),
      text('refs'),
      str('threadId', 64),
    ],
    indexes: [{ key: 'k_owner', type: 'key', columns: ['ownerId'] }],
  },
  [TABLES.contacts]: {
    name: 'Contacts',
    permissions: [Permission.create(Role.users())],
    columns: [
      str('ownerId', 36, { required: true }),
      str('email', 320, { required: true }),
      str('name', 128),
      str('company', 128),
      str('phone', 32),
      text('notes'),
      bool('favorite'),
      date('lastContactedAt'),
      int('timesContacted', { xdefault: 0 }),
    ],
    indexes: [
      { key: 'k_owner_email', type: 'key', columns: ['ownerId', 'email'], lengths: [36, 191] },
      { key: 'k_owner_last', type: 'key', columns: ['ownerId', 'lastContactedAt'], orders: ['asc', 'desc'] },
    ],
  },
  [TABLES.labels]: {
    name: 'Labels',
    permissions: [Permission.create(Role.users())],
    columns: [
      str('ownerId', 36, { required: true }),
      str('name', 64, { required: true }),
      str('color', 16),
    ],
    indexes: [{ key: 'k_owner', type: 'key', columns: ['ownerId'] }],
  },
  // Server-wide settings, one row (`app`). Anyone can read whether sign-ups
  // are open; only the api function writes it.
  [TABLES.config]: {
    name: 'Config',
    permissions: [Permission.read(Role.any())],
    columns: [bool('signupsOpen', false)],
    indexes: [],
  },
  // Personal API keys. Only a SHA-256 hash is stored; rows are created by the
  // api function and readable and deletable by their owner.
  [TABLES.apikeys]: {
    name: 'API keys',
    permissions: [],
    columns: [
      str('ownerId', 36, { required: true }),
      str('name', 64, { required: true }),
      str('prefix', 16, { required: true }),
      str('hash', 64, { required: true }),
      str('scopes', 32, { array: true }),
      date('lastUsedAt'),
    ],
    indexes: [
      { key: 'k_owner', type: 'key', columns: ['ownerId'] },
      { key: 'u_hash', type: 'unique', columns: ['hash'] },
    ],
  },
};

async function createColumn(tableId, c) {
  const base = { databaseId: DATABASE_ID, tableId, key: c.key, required: c.required ?? false };
  const extra = { array: c.array ?? false };
  switch (c.kind) {
    case 'varchar':
      return tablesDB.createVarcharColumn({ ...base, ...extra, size: c.size, xdefault: c.xdefault });
    case 'text':
      return tablesDB.createTextColumn({ ...base, ...extra });
    case 'mediumtext':
      return tablesDB.createMediumtextColumn({ ...base, ...extra });
    case 'boolean':
      return tablesDB.createBooleanColumn({ ...base, xdefault: c.required ? undefined : c.xdefault });
    case 'datetime':
      return tablesDB.createDatetimeColumn({ ...base });
    case 'integer':
      return tablesDB.createIntegerColumn({ ...base, xdefault: c.xdefault });
    case 'float':
      return tablesDB.createFloatColumn({ ...base, xdefault: c.xdefault });
  }
}

async function waitForColumns(tableId) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({
      databaseId: DATABASE_ID,
      tableId,
      queries: [Query.limit(100)],
    });
    const pending = columns.filter((c) => c.status !== 'available');
    const failed = columns.filter((c) => c.status === 'failed');
    if (failed.length) throw new Error(`Columns failed: ${failed.map((c) => c.key).join(', ')}`);
    if (!pending.length) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for columns on ${tableId}`);
}

console.log('Database');
await ensure(`database ${DATABASE_ID}`, () => tablesDB.create({ databaseId: DATABASE_ID, name: 'Mail' }));

for (const [tableId, t] of Object.entries(schema)) {
  console.log(`Table ${tableId}`);
  await ensure(`table ${tableId}`, () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId,
      name: t.name,
      permissions: t.permissions,
      rowSecurity: true,
    }),
  );
  await Promise.all(t.columns.map((c) => ensure(`column ${c.key}`, () => createColumn(tableId, c))));
  await waitForColumns(tableId);
  for (const idx of t.indexes) {
    await ensure(`index ${idx.key}`, () =>
      tablesDB.createIndex({
        databaseId: DATABASE_ID,
        tableId,
        key: idx.key,
        type: TablesDBIndexType[idx.type[0].toUpperCase() + idx.type.slice(1)],
        columns: idx.columns,
        orders: idx.orders?.map((o) => (o === 'desc' ? OrderBy.Desc : OrderBy.Asc)),
        lengths: idx.lengths,
      }),
    );
  }
}

console.log('Storage');
await ensure(`bucket ${BUCKET_ID}`, () =>
  storage.createBucket({
    bucketId: BUCKET_ID,
    name: 'Attachments',
    permissions: [Permission.create(Role.users())],
    fileSecurity: true,
    enabled: true,
    maximumFileSize: 25 * 1024 * 1024,
    compression: Compression.None,
    encryption: true,
    antivirus: true,
  }),
);

console.log('Done.');
