import { Client, TablesDB, Storage, Users, Messaging, Tokens } from 'node-appwrite';

export const DATABASE_ID = 'mail';
export const BUCKET_ID = 'attachments';
export const TABLES = {
  mailboxes: 'mailboxes',
  settings: 'settings',
  messages: 'messages',
  drafts: 'drafts',
  contacts: 'contacts',
  labels: 'labels',
};

// Function that owns the inbound addresses: <handle>@inbox-<project>.appwrite.email
// (the legacy <handle>+inbox@<project>.appwrite.email form is still routed).
export const INBOX_FUNCTION_ID = process.env.INBOX_FUNCTION_ID || 'inbox';
// User that holds email targets for external recipients (Messaging sends to targets).
export const RECIPIENTS_USER_ID = 'recipients';

export const ENDPOINT = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
export const PROJECT_ID = process.env.APPWRITE_FUNCTION_PROJECT_ID;
export const MAIL_ZONE = process.env.MAIL_ZONE || 'appwrite.email';
export const BUILTIN_DOMAIN = `${PROJECT_ID}.${MAIL_ZONE}`;
// Function and project share one host label, so any local part reaches the function.
export const MAILBOX_DOMAIN = `${INBOX_FUNCTION_ID.toLowerCase()}-${PROJECT_ID}.${MAIL_ZONE}`.toLowerCase();
// Verified custom email domains connected to the inbox function, where bare <handle>@domain works.
export const CUSTOM_DOMAINS = (process.env.CUSTOM_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function services(key) {
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(key);
  return {
    client,
    tablesDB: new TablesDB(client),
    storage: new Storage(client),
    users: new Users(client),
    messaging: new Messaging(client),
    tokens: new Tokens(client),
  };
}

export function fileViewUrl(fileId, token) {
  return `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${PROJECT_ID}&token=${token}`;
}

export function fileDownloadUrl(fileId, token) {
  return `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/download?project=${PROJECT_ID}&token=${token}`;
}
