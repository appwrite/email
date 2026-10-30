// Context menu builders shared by the message list, the reader and the sidebar.
import {
  Archive,
  AtSign,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  FolderInput,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  PenSquare,
  Reply,
  ReplyAll,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  UserPlus,
  UserRound,
} from 'lucide-react';
import type { MenuEntry } from '~/components/ContextMenu';
import {
  addContact,
  archive,
  blockSender,
  copyText,
  findContact,
  forward,
  moveTo,
  reply,
  setRead,
  snooze,
  snoozePresets,
  spam,
  toggleLabel,
  toggleStar,
  trash,
} from './actions';
import type { LabelRow, MailboxRow, MessageRow } from './appwrite';
import { FOLDERS } from './folders';
import { displayName, formatAddress } from './format';
import { findCachedRow } from './queries';
import { openComposer } from './store';

export type MessageMenuContext = {
  uid: string;
  mailbox: MailboxRow;
  labels: LabelRow[];
  signature?: string;
  blocked: string[];
  /** Messages the menu acts on: the selection when the row is part of it. */
  ids: string[];
  onOpen?: () => void;
  onSelect?: () => void;
  selected?: boolean;
  /** Called after the messages leave the current view. */
  onRemoved?: () => void;
};

const plural = (n: number) => (n === 1 ? '' : ` ${n} Messages`);

/** Menu for a person's address: write to them, add them to Contacts, copy, block. */
export function addressMenu(uid: string, who: { name?: string; email: string }, blocked: string[] = []): MenuEntry[] {
  const person = { name: who.name || '', email: who.email };
  const contact = findContact(uid, person.email);
  const label = displayName(person);
  return [
    { heading: person.email },
    { label: `New Message to ${label}`, icon: <PenSquare />, onSelect: () => openComposer({ to: [formatAddress(person)], focus: 'body' }) },
    contact
      ? { label: 'Open Contact', icon: <UserRound />, onSelect: () => window.location.assign(`/mail/contacts?c=${contact.$id}`) }
      : { label: 'Add to Contacts', icon: <UserPlus />, onSelect: () => addContact(uid, person) },
    { label: 'Copy Address', icon: <Copy />, onSelect: () => copyText(person.email, 'Address copied') },
    { label: 'Copy Name and Address', icon: <AtSign />, onSelect: () => copyText(formatAddress(person), 'Copied') },
    { separator: true },
    blocked.includes(person.email.toLowerCase())
      ? { label: 'Sender is blocked', icon: <Ban />, disabled: true }
      : { label: `Block ${label}`, icon: <Ban />, danger: true, onSelect: () => blockSender(uid, blocked, person.email) },
  ];
}

export function messageMenu(row: MessageRow, ctx: MessageMenuContext): MenuEntry[] {
  const ids = ctx.ids.length ? ctx.ids : [row.$id];
  const many = ids.length > 1;
  const rows = ids.map((id) => findCachedRow(id) || (id === row.$id ? row : null)).filter(Boolean) as MessageRow[];
  const allRead = rows.every((r) => r.read);
  const allStarred = rows.every((r) => r.starred);
  const removed = ctx.onRemoved || (() => {});
  const sender = { name: row.fromName, email: row.fromEmail };
  const fromMe = row.fromEmail.toLowerCase() === ctx.mailbox.address.toLowerCase();
  const contact = !fromMe && findContact(ctx.uid, row.fromEmail);
  const n = plural(ids.length);

  return [
    many && { heading: `${ids.length} messages selected` },
    !many && ctx.onOpen && { label: 'Open', icon: <MailOpen />, onSelect: ctx.onOpen },
    !many && { label: 'Reply', icon: <Reply />, shortcut: 'R', onSelect: () => reply(row, ctx.mailbox, false, ctx.signature) },
    !many && { label: 'Reply All', icon: <ReplyAll />, shortcut: 'A', onSelect: () => reply(row, ctx.mailbox, true, ctx.signature) },
    !many && { label: 'Forward', icon: <Forward />, shortcut: 'F', onSelect: () => forward(row, ctx.signature) },
    { separator: true },
    { label: allRead ? `Mark${n} as Unread` : `Mark${n} as Read`, icon: allRead ? <Mail /> : <MailOpen />, shortcut: 'U', onSelect: () => setRead(ids, !allRead) },
    { label: allStarred ? 'Unstar' : 'Star', icon: <Star />, shortcut: 'S', onSelect: () => toggleStar(ids) },
    {
      label: 'Snooze',
      icon: <Clock />,
      submenu: snoozePresets().map((p) => ({ label: `${p.label}  ·  ${p.hint}`, onSelect: () => (snooze(ids, p.date), removed()) })),
    },
    {
      label: 'Move to',
      icon: <FolderInput />,
      submenu: FOLDERS.filter((f) => ['inbox', 'archive', 'spam', 'trash'].includes(f.id) && f.id !== row.folder).map((f) => ({
        label: f.label,
        icon: <f.icon />,
        onSelect: () => (moveTo(ids, f.id), removed()),
      })),
    },
    ctx.labels.length > 0 && {
      label: 'Label',
      icon: <Tag />,
      submenu: ctx.labels.map((l) => ({
        label: l.name,
        checked: rows.every((r) => (r.labels || []).includes(l.$id)),
        onSelect: () => toggleLabel(ids, l.$id),
      })),
    },
    { separator: true },
    row.folder === 'archive'
      ? { label: 'Move to Inbox', icon: <Inbox />, onSelect: () => (moveTo(ids, 'inbox'), removed()) }
      : { label: 'Archive', icon: <Archive />, shortcut: 'E', onSelect: () => (archive(ids), removed()) },
    row.folder === 'spam'
      ? { label: 'Not Junk', icon: <Inbox />, onSelect: () => (spam(ids, false), removed()) }
      : { label: 'Mark as Junk', icon: <ShieldAlert />, shortcut: '!', onSelect: () => (spam(ids, true), removed()) },
    { label: row.folder === 'trash' ? 'Delete Forever' : 'Delete', icon: <Trash2 />, danger: true, shortcut: '⌫', onSelect: () => (trash(ids), removed()) },
    !many && !fromMe && { separator: true },
    !many && !fromMe && { heading: displayName(sender) },
    !many &&
      !fromMe &&
      (contact
        ? { label: 'Open Contact', icon: <UserRound />, onSelect: () => window.location.assign(`/mail/contacts?c=${contact.$id}`) }
        : { label: 'Add Sender to Contacts', icon: <UserPlus />, onSelect: () => addContact(ctx.uid, sender) }),
    !many && !fromMe && { label: 'Copy Sender Address', icon: <Copy />, onSelect: () => copyText(row.fromEmail, 'Address copied') },
    !many &&
      !fromMe &&
      !ctx.blocked.includes(row.fromEmail.toLowerCase()) && {
        label: 'Block Sender',
        icon: <Ban />,
        danger: true,
        onSelect: () => (blockSender(ctx.uid, ctx.blocked, row.fromEmail, [row.$id]), removed()),
      },
    ctx.onSelect && { separator: true },
    ctx.onSelect && { label: ctx.selected ? 'Deselect' : 'Select', icon: <CheckCircle2 />, shortcut: 'X', onSelect: ctx.onSelect },
  ].filter(Boolean) as MenuEntry[];
}
