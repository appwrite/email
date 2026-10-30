// Server-wide settings and admin helpers. The first person to claim an address
// on a fresh install becomes the admin and sign-ups close; admins can reopen
// them or create accounts themselves.
import { Permission, Query, Role } from 'node-appwrite';
import { DATABASE_ID, RECIPIENTS_USER_ID, TABLES } from './appwrite.js';
import { HttpError } from './compose.js';
import { getRowOrNull } from './mail.js';

export const ADMIN_LABEL = 'admin';
export const BRANDING_BUCKET_ID = 'branding';

/** Current branding; empty strings mean the built-in defaults. */
export function brandOf(config) {
  return { brandName: config?.brandName || '', brandLogo: config?.brandLogo || '', brandAccent: config?.brandAccent || '' };
}

/** Validates branding input; returns only the fields that were given. */
export function readBrand(body) {
  const out = {};
  if (typeof body.brandName === 'string') {
    const name = body.brandName.trim();
    if (name.length > 40) throw new HttpError(400, 'Keep the name to 40 characters.');
    out.brandName = name;
  }
  if (typeof body.brandLogo === 'string') {
    if (body.brandLogo && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(body.brandLogo)) throw new HttpError(400, 'That logo file is not valid.');
    out.brandLogo = body.brandLogo;
  }
  if (typeof body.brandAccent === 'string') {
    const accent = body.brandAccent.trim().toLowerCase();
    if (accent && !/^#[0-9a-f]{6}$/.test(accent)) throw new HttpError(400, 'Use a hex color like #007aff.');
    out.brandAccent = accent;
  }
  return out;
}
const CONFIG_ROW = 'app';

export async function getConfig(svc) {
  return getRowOrNull(svc.tablesDB, TABLES.config, CONFIG_ROW);
}

export async function setConfig(svc, data) {
  return svc.tablesDB.upsertRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.config,
    rowId: CONFIG_ROW,
    data,
    permissions: [Permission.read(Role.any())],
  });
}

export const hasAdminLabel = (user) => (user.labels || []).includes(ADMIN_LABEL);

export async function requireAdmin(svc, userId) {
  const user = await svc.users.get({ userId });
  if (!hasAdminLabel(user)) throw new HttpError(403, 'Only admins can do that.');
  return user;
}

export async function setAdmin(svc, user, admin) {
  const labels = new Set(user.labels || []);
  if (admin) labels.add(ADMIN_LABEL);
  else labels.delete(ADMIN_LABEL);
  return svc.users.updateLabels({ userId: user.$id, labels: [...labels] });
}

/**
 * Enforces sign-ups at the Appwrite level: while closed, the project's user
 * cap equals the current user count, so public sign-up is rejected while
 * server-side account creation by admins still works. 0 removes the cap.
 */
export async function syncUserLimit(svc, open) {
  const total = open ? 0 : (await svc.users.list({ queries: [Query.limit(1)] })).total;
  await svc.project.updateUserLimitPolicy({ total });
}

async function countRows(svc, tableId, queries) {
  return (await svc.tablesDB.listRows({ databaseId: DATABASE_ID, tableId, queries: [...queries, Query.limit(1), Query.select(['$id'])] })).total;
}

/** Every person on the server with their mailbox and usage. */
export async function listAccounts(svc) {
  const users = [];
  let cursor = null;
  for (;;) {
    const page = await svc.users.list({ queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
    users.push(...page.users);
    if (page.users.length < 100) break;
    cursor = page.users[page.users.length - 1].$id;
  }
  const people = users.filter((u) => u.$id !== RECIPIENTS_USER_ID);
  const { rows: mailboxes } = await svc.tablesDB.listRows({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, queries: [Query.limit(5000)] });
  const byUser = new Map(mailboxes.map((m) => [m.userId, m]));
  return Promise.all(
    people.map(async (u) => ({
      id: u.$id,
      name: u.name,
      email: u.email,
      status: u.status,
      admin: hasAdminLabel(u),
      emailVerification: u.emailVerification,
      mfa: u.mfa,
      createdAt: u.registration || u.$createdAt,
      accessedAt: u.accessedAt || null,
      address: byUser.get(u.$id)?.address || null,
      handle: byUser.get(u.$id)?.handle || null,
      messages: await countRows(svc, TABLES.messages, [Query.equal('ownerId', u.$id)]),
    })),
  );
}
