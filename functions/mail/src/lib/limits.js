// Sending rate limits. Every recipient of an outgoing message counts once,
// in rolling minute, hour and day windows, and messages are capped at a
// number of recipients. Admins configure all of it in the Admin page; 0
// means unlimited. Each send is logged server-side in `sendlog`, so deleting
// sent mail never resets the count.
import { ID, Query } from 'node-appwrite';
import { DATABASE_ID, TABLES } from './appwrite.js';
import { HttpError } from './compose.js';
import { getConfig, hasAdminLabel } from './admin.js';
import { handleFromAddress } from './address.js';

export const LIMIT_DEFAULTS = {
  sendPerMinute: 20,
  sendPerHour: 200,
  sendPerDay: 1000,
  maxRecipients: 50,
  exemptAdmins: true,
};

// Upper bound on what an admin can set, to keep the counting query cheap.
export const LIMIT_MAX = { sendPerMinute: 1000, sendPerHour: 10000, sendPerDay: 50000, maxRecipients: 500 };

const WINDOWS = [
  ['sendPerMinute', 60_000, 'minute'],
  ['sendPerHour', 3_600_000, 'hour'],
  ['sendPerDay', 86_400_000, 'day'],
];

/** The effective limits, with defaults for anything never set. */
export function limitsOf(config) {
  const out = {};
  for (const [k, v] of Object.entries(LIMIT_DEFAULTS)) {
    const value = config?.[k];
    out[k] = value === null || value === undefined ? v : value;
  }
  return out;
}

/** Validates admin input; returns only the fields that were given. */
export function readLimits(body) {
  const out = {};
  for (const k of Object.keys(LIMIT_MAX)) {
    if (body[k] === undefined) continue;
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 0 || n > LIMIT_MAX[k]) {
      throw new HttpError(400, `${k} must be a whole number from 0 to ${LIMIT_MAX[k]}.`);
    }
    out[k] = n;
  }
  if (body.maxRecipients !== undefined && out.maxRecipients === 0) throw new HttpError(400, 'Allow at least one recipient per message.');
  if (typeof body.exemptAdmins === 'boolean') out.exemptAdmins = body.exemptAdmins;
  return out;
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function waitText(ms) {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'in a minute';
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return `in ${plural(hours, 'hour')}`;
}

/** Recipients sent by a user per window, from the send log. */
export async function usage(svc, userId) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.sendlog,
    queries: [Query.equal('ownerId', userId), Query.greaterThan('at', since), Query.select(['recipients', 'at']), Query.orderAsc('at'), Query.limit(5000)],
    total: false,
  });
  const now = Date.now();
  return {
    rows,
    minute: rows.filter((r) => now - new Date(r.at).getTime() < 60_000).reduce((n, r) => n + r.recipients, 0),
    hour: rows.filter((r) => now - new Date(r.at).getTime() < 3_600_000).reduce((n, r) => n + r.recipients, 0),
    day: rows.reduce((n, r) => n + r.recipients, 0),
  };
}

/**
 * Throws a 429 HttpError when sending to `count` more recipients would pass a
 * limit, with `retryAfter` in seconds; a 400 when the message itself has too
 * many recipients.
 */
export async function checkSendLimits(svc, userId, count) {
  const limits = limitsOf(await getConfig(svc));
  if (limits.exemptAdmins && hasAdminLabel(await svc.users.get({ userId }))) return;
  if (limits.maxRecipients && count > limits.maxRecipients) {
    throw new HttpError(400, `Send to up to ${plural(limits.maxRecipients, 'recipient')} per message.`);
  }
  if (!WINDOWS.some(([key]) => limits[key])) return;
  const used = await usage(svc, userId);
  const now = Date.now();
  for (const [key, span, unit] of WINDOWS) {
    const limit = limits[key];
    if (!limit) continue;
    const total = used[unit] + count;
    if (total <= limit) continue;
    // When enough of the window's oldest sends expire to make room.
    let excess = total - limit;
    let retryAt = now + span;
    for (const r of used.rows) {
      const at = new Date(r.at).getTime();
      if (now - at >= span) continue;
      excess -= r.recipients;
      if (excess <= 0) {
        retryAt = at + span;
        break;
      }
    }
    const err = new HttpError(
      429,
      count > limit
        ? `This message has more recipients than the ${plural(limit, 'email')} per ${unit} you can send.`
        : `You’ve reached the limit of ${plural(limit, 'email')} per ${unit}. Try again ${waitText(retryAt - now)}.`,
    );
    err.retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000));
    throw err;
  }
}

/** Number of recipients, and how many are outside this server. */
export function countRecipients(input) {
  const all = [...input.to, ...input.cc, ...input.bcc];
  return { recipients: all.length, external: all.filter((a) => !handleFromAddress(a)).length };
}

export async function recordSend(svc, userId, { recipients, external = 0 }) {
  await svc.tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.sendlog,
    rowId: ID.unique(),
    data: { ownerId: userId, recipients, external, at: new Date().toISOString() },
  });
}

/** Drops log rows older than two days; limits only look back one. */
export async function purgeSendLog(svc) {
  const before = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await svc.tablesDB.deleteRows({ databaseId: DATABASE_ID, tableId: TABLES.sendlog, queries: [Query.lessThan('at', before)] });
}
