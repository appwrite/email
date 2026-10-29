// Shared by the app API and the public API: input validation and the
// sender details every outgoing message needs.
import { BUCKET_ID, TABLES } from './appwrite.js';
import { parseAddress } from './address.js';
import { truncate } from './content.js';
import { getRowOrNull } from './mail.js';

export class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENTS = 10;

export async function getMailbox(svc, userId) {
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
export async function loadAttachments(svc, userId, ids) {
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

export function readInput(body) {
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

export async function senderName(svc, userId, mailbox) {
  const user = await svc.users.get({ userId });
  return user.name || mailbox.name || mailbox.handle;
}

