import {
  Account,
  Avatars,
  Client,
  Functions,
  Realtime,
  Storage,
  TablesDB,
  type Models,
} from 'appwrite';

// Set VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID to run against your
// own Appwrite instance; the defaults are the hosted demo project.
export const ENDPOINT: string = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
export const PROJECT_ID: string = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6ae21f6271db427f12bc';
const MAIL_ZONE: string = import.meta.env.VITE_MAIL_ZONE || 'appwrite.email';
export const DATABASE_ID = 'mail';
export const BUCKET_ID = 'attachments';
export const INBOX_FUNCTION_ID = 'inbox';
export const API_FUNCTION_ID = 'api';
// <handle>@inbox-<project>.appwrite.email; the legacy <handle>+inbox@<project>.appwrite.email still arrives.
export const MAIL_DOMAIN = `${INBOX_FUNCTION_ID}-${PROJECT_ID}.${MAIL_ZONE}`;
const LEGACY_DOMAIN = `${PROJECT_ID}.${MAIL_ZONE}`;

export const TABLES = {
  mailboxes: 'mailboxes',
  settings: 'settings',
  messages: 'messages',
  drafts: 'drafts',
  contacts: 'contacts',
  labels: 'labels',
  apikeys: 'apikeys',
} as const;

export const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export const avatars = new Avatars(client);

let realtimeInstance: Realtime | null = null;
export function realtime() {
  realtimeInstance ??= new Realtime(client);
  return realtimeInstance;
}

export function addressFor(handle: string) {
  return `${handle}@${MAIL_DOMAIN}`;
}

/** True for any address that reaches this mailbox, current or legacy form. */
export function isOwnAddress(email: string, handle: string) {
  const e = email.trim().toLowerCase();
  return e === `${handle}@${MAIL_DOMAIN}` || e.startsWith(`${handle}+`) && e.endsWith(`@${MAIL_DOMAIN}`) || e === `${handle}+${INBOX_FUNCTION_ID}@${LEGACY_DOMAIN}`;
}

export type Folder =
  | 'inbox'
  | 'starred'
  | 'snoozed'
  | 'drafts'
  | 'sent'
  | 'scheduled'
  | 'archive'
  | 'spam'
  | 'trash'
  | 'all'
  | 'label';

export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  cid?: string;
  inline?: boolean;
  token?: string;
};

export type MessageRow = Models.Row & {
  ownerId: string;
  folder: string;
  threadId: string;
  messageId?: string;
  inReplyTo?: string;
  refs?: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  snippet: string;
  text?: string;
  html?: string;
  date: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  attachments: string;
  hasAttachments: boolean;
  size?: number;
  status?: string;
  scheduledAt?: string | null;
  snoozedUntil?: string | null;
  spamScore?: number | null;
  spamReason?: string;
};

export type DraftRow = Models.Row & {
  ownerId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  attachments: string;
  inReplyTo?: string;
  refs?: string;
  threadId?: string;
};

export type MailboxRow = Models.Row & {
  userId: string;
  handle: string;
  address: string;
  name: string;
};

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  match: 'all' | 'any';
  conditions: { field: 'from' | 'to' | 'subject' | 'body'; op: 'contains' | 'equals' | 'startsWith' | 'endsWith'; value: string }[];
  actions: { folder?: string; label?: string; read?: boolean; star?: boolean };
};

export type SettingsRow = Models.Row & {
  signature: string;
  vacationEnabled: boolean;
  vacationSubject: string;
  vacationMessage: string;
  vacationUntil: string | null;
  blockedSenders: string[];
  rules: string;
  forwardTo: string;
};

export type ContactRow = Models.Row & {
  ownerId: string;
  email: string;
  name: string;
  company: string;
  phone: string;
  notes: string;
  favorite: boolean;
  lastContactedAt: string | null;
  timesContacted: number;
};

export type LabelRow = Models.Row & {
  ownerId: string;
  name: string;
  color: string;
};

export function parseAttachments(value?: string): Attachment[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function fileUrl(a: Attachment, mode: 'view' | 'download' = 'view') {
  const base = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${a.id}/${mode}?project=${PROJECT_ID}`;
  return a.token ? `${base}&token=${encodeURIComponent(a.token)}` : base;
}

export function filePreviewUrl(a: Attachment, width = 480, height = 320) {
  const base = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${a.id}/preview?project=${PROJECT_ID}&width=${width}&height=${height}&quality=80&output=webp`;
  return a.token ? `${base}&token=${encodeURIComponent(a.token)}` : base;
}

/** Appwrite Avatars user photo (Gravatar/Libravatar) for a SHA-256 email hash. */
export function photoUrl(emailHash: string, size = 128) {
  return `${ENDPOINT}/avatars/photo?emailHash=${emailHash}&width=${size}&height=${size}&quality=85&output=webp&project=${PROJECT_ID}`;
}

export function faviconUrl(domain: string) {
  return `${ENDPOINT}/avatars/favicon?url=${encodeURIComponent(`https://${domain}`)}&project=${PROJECT_ID}`;
}

export function qrUrl(text: string, size = 240) {
  return `${ENDPOINT}/avatars/qr?text=${encodeURIComponent(text)}&size=${size}&margin=1&project=${PROJECT_ID}`;
}
