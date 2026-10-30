import { callApi } from './api';
import { Query } from 'appwrite';
import { DATABASE_ID, TABLES, isOwnAddress, parseAttachments, tablesDB, type ContactRow, type MailboxRow, type MessageRow } from './appwrite';
import { FOLDER_LABELS } from './folders';
import {
  displayName,
  escapeHtml,
  forwardSubject,
  formatAddress,
  fullDate,
  parseAddress,
  replySubject,
  sha1Hex,
} from './format';
import { deleteMessagesForever, findCachedRow, ownerPerms, queryClient, updateMessages } from './queries';
import { openComposer, toast, type ComposerState } from './store';

function rowsFor(ids: string[]) {
  return ids.map((id) => findCachedRow(id)).filter(Boolean) as MessageRow[];
}

function undoable(ids: string[], title: string, data: Partial<MessageRow>) {
  const before = rowsFor(ids).map((r) => ({ id: r.$id, folder: r.folder, snoozedUntil: r.snoozedUntil ?? null, read: r.read }));
  return updateMessages(ids, data)
    .then(() =>
      toast({
        title,
        tone: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            before.forEach((b) => updateMessages([b.id], { folder: b.folder, snoozedUntil: b.snoozedUntil, read: b.read }));
          },
        },
      }),
    )
    .catch((e) => toast({ title: 'Could not update', description: e.message, tone: 'error' }));
}

const plural = (n: number, word = 'message') => (n === 1 ? `1 ${word}` : `${n} ${word}s`);

export function moveTo(ids: string[], folder: string) {
  if (!ids.length) return;
  return undoable(ids, `Moved ${plural(ids.length)} to ${FOLDER_LABELS[folder] || folder}`, { folder, snoozedUntil: null });
}

export const archive = (ids: string[]) => ids.length && undoable(ids, `Archived ${plural(ids.length)}`, { folder: 'archive' });

export function trash(ids: string[]) {
  const rows = rowsFor(ids);
  if (rows.length && rows.every((r) => r.folder === 'trash')) {
    return deleteMessagesForever(ids).then(() => toast({ title: `Deleted ${plural(ids.length)} forever`, tone: 'success' }));
  }
  return ids.length && undoable(ids, `Moved ${plural(ids.length)} to Trash`, { folder: 'trash' });
}

export function spam(ids: string[], isSpam = true) {
  return undoable(ids, isSpam ? `Marked ${plural(ids.length)} as junk` : `Moved ${plural(ids.length)} to Inbox`, {
    folder: isSpam ? 'spam' : 'inbox',
  });
}

export function setRead(ids: string[], read: boolean) {
  return updateMessages(ids, { read }).catch((e) => toast({ title: 'Could not update', description: e.message, tone: 'error' }));
}

export function toggleStar(ids: string[]) {
  const rows = rowsFor(ids);
  const starred = !rows.every((r) => r.starred);
  return updateMessages(ids, { starred });
}

export function toggleLabel(ids: string[], labelId: string) {
  const rows = rowsFor(ids);
  const add = !rows.every((r) => (r.labels || []).includes(labelId));
  return Promise.all(
    rows.map((r) => {
      const labels = new Set(r.labels || []);
      if (add) labels.add(labelId);
      else labels.delete(labelId);
      return updateMessages([r.$id], { labels: [...labels] });
    }),
  );
}

export function snooze(ids: string[], until: Date) {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return undoable(ids, `Snoozed until ${fmt.format(until)}`, { folder: 'snoozed', snoozedUntil: until.toISOString() });
}

export function snoozePresets(now = new Date()) {
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const laterToday = new Date(now.getTime() + 3 * 3600_000);
  laterToday.setMinutes(0, 0, 0);
  const tomorrow = at(new Date(now.getTime() + 86400_000), 8);
  const saturday = at(new Date(now.getTime() + (((6 - now.getDay() + 7) % 7) || 7) * 86400_000), 9);
  const monday = at(new Date(now.getTime() + (((1 - now.getDay() + 7) % 7) || 7) * 86400_000), 8);
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const list = [
    { label: 'Later today', date: laterToday },
    { label: 'Tomorrow', date: tomorrow },
    { label: 'This weekend', date: saturday },
    { label: 'Next week', date: monday },
  ];
  return list
    .filter((p) => p.label !== 'Later today' || laterToday.getDate() === now.getDate())
    .map((p) => ({ ...p, hint: fmt.format(p.date) }));
}

export async function emptyTrash() {
  const { deleted } = await callApi<{ deleted: number }>('POST', '/trash/empty');
  queryClient.invalidateQueries({ queryKey: ['messages'] });
  queryClient.invalidateQueries({ queryKey: ['counts'] });
  toast({ title: deleted ? `Deleted ${plural(deleted)} forever` : 'Nothing to delete', tone: 'success' });
}

// ---------------------------------------------------------------------------
// Reply / forward
// ---------------------------------------------------------------------------

function quoteBlock(row: MessageRow) {
  const from = formatAddress({ name: row.fromName, email: row.fromEmail });
  const body = row.html || `<div style="white-space:pre-wrap">${escapeHtml(row.text || '')}</div>`;
  return `<div><br></div><div><br></div><div style="color:#86868b">On ${escapeHtml(fullDate(row.date))}, ${escapeHtml(from)} wrote:</div><blockquote style="margin:0 0 0 .6ex;border-left:2px solid #d2d2d7;padding-left:1ex">${body}</blockquote>`;
}

function forwardBlock(row: MessageRow) {
  const body = row.html || `<div style="white-space:pre-wrap">${escapeHtml(row.text || '')}</div>`;
  const line = (k: string, v: string) => (v ? `<div><b>${k}:</b> ${escapeHtml(v)}</div>` : '');
  return `<div><br></div><div><br></div><div style="color:#86868b">Begin forwarded message:</div><blockquote style="margin:0 0 0 .6ex;border-left:2px solid #d2d2d7;padding-left:1ex">${line('From', formatAddress({ name: row.fromName, email: row.fromEmail }))}${line('Subject', row.subject)}${line('Date', fullDate(row.date))}${line('To', (row.to || []).join(', '))}${line('Cc', (row.cc || []).join(', '))}<br>${body}</blockquote>`;
}

function signatureHtml(signature?: string) {
  if (!signature?.trim()) return '';
  return `<div><br></div><div class="signature" style="color:#6e6e73">${signature
    .split('\n')
    .map((l) => escapeHtml(l) || '<br>')
    .join('<br>')}</div>`;
}

function threadRefs(row: MessageRow) {
  return [...(row.refs || '').split(/\s+/).filter(Boolean), row.messageId].filter(Boolean) as string[];
}

export function compose(signature?: string, init: Partial<ComposerState> = {}) {
  return openComposer({ html: signatureHtml(signature), ...init });
}

export function reply(row: MessageRow, mailbox: MailboxRow, all: boolean, signature?: string) {
  const isSelf = (email: string) => isOwnAddress(email, mailbox.handle);
  const sentByMe = isSelf(row.fromEmail);
  const primary = sentByMe ? row.to : [row.replyTo || formatAddress({ name: row.fromName, email: row.fromEmail })];
  const notMe = (v: string) => !isSelf(parseAddress(v).email);
  let to = primary.filter(notMe);
  let cc: string[] = [];
  if (all) {
    const seen = new Set(to.map((v) => parseAddress(v).email));
    cc = [...(sentByMe ? [] : row.to || []), ...(row.cc || [])].filter((v) => {
      const e = parseAddress(v).email;
      if (isSelf(e) || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
  }
  if (!to.length) to = primary;
  return openComposer({
    mode: all ? 'replyAll' : 'reply',
    to,
    cc,
    showCc: cc.length > 0,
    subject: replySubject(row.subject || ''),
    html: signatureHtml(signature) + quoteBlock(row),
    inReplyTo: row.messageId || '',
    refs: threadRefs(row),
    threadId: row.threadId,
    focus: 'body',
  });
}

export function forward(row: MessageRow, signature?: string) {
  const attachments = parseAttachments(row.attachments).filter((a) => !a.inline);
  return openComposer({
    mode: 'forward',
    subject: forwardSubject(row.subject || ''),
    html: signatureHtml(signature) + forwardBlock(row),
    attachments,
    focus: 'to',
  });
}

export function senderLabel(row: MessageRow) {
  return displayName({ name: row.fromName, email: row.fromEmail });
}

// ---------------------------------------------------------------------------
// Contacts, blocking and clipboard
// ---------------------------------------------------------------------------

/** Row ID shared with the server, which files contacts the same way. */
export async function contactId(uid: string, email: string) {
  return 'c' + (await sha1Hex(`${uid}:${email.trim().toLowerCase()}`)).slice(0, 32);
}

export function findContact(uid: string, email: string) {
  const list = queryClient.getQueryData<ContactRow[]>(['contacts', uid]) || [];
  const e = email.trim().toLowerCase();
  return list.find((c) => c.email === e);
}

export async function addContact(uid: string, { email, name }: { email: string; name?: string }) {
  const normalized = email.trim().toLowerCase();
  const rowId = await contactId(uid, normalized);
  try {
    await tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.contacts,
      rowId,
      data: { ownerId: uid, email: normalized, name: (name || '').trim(), timesContacted: 0 },
      permissions: ownerPerms(uid),
    });
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    toast({
      title: `Added ${name || normalized} to Contacts`,
      tone: 'success',
      action: { label: 'View', onClick: () => window.location.assign(`/mail/contacts?c=${rowId}`) },
    });
    return rowId;
  } catch (e: any) {
    toast({ title: 'Could not add contact', description: e.message, tone: 'error' });
    return null;
  }
}

export async function blockSender(uid: string, blocked: string[], email: string, ids: string[] = []) {
  const address = email.trim().toLowerCase();
  const list = [...new Set([...blocked, address])];
  await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.settings, rowId: uid, data: { blockedSenders: list } });
  queryClient.invalidateQueries({ queryKey: ['settings'] });
  if (ids.length) await trash(ids);
  toast({ title: `Blocked ${address}`, description: 'Future mail goes straight to Trash.', tone: 'success' });
}

export function copyText(text: string, what = 'Copied') {
  navigator.clipboard.writeText(text).then(
    () => toast({ title: what, tone: 'success', duration: 1600 }),
    () => toast({ title: 'Could not copy', tone: 'error' }),
  );
}

/** Marks every unread message in a folder as read. */
export async function markFolderRead(uid: string, folder: string) {
  const { rows } = await tablesDB.listRows<MessageRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.messages,
    queries: [Query.equal('ownerId', uid), Query.equal('folder', folder), Query.equal('read', false), Query.select(['$id']), Query.limit(500)],
    total: false,
  });
  if (!rows.length) return toast({ title: 'Nothing unread here', tone: 'success', duration: 1600 });
  await updateMessages(rows.map((r) => r.$id), { read: true });
  queryClient.invalidateQueries({ queryKey: ['counts'] });
  toast({ title: `Marked ${plural(rows.length)} as read`, tone: 'success' });
}
