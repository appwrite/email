// Point at Appwrite Cloud or a self-hosted instance with APPWRITE_ENDPOINT and
// APPWRITE_PROJECT_ID; the defaults are the hosted demo project.
export const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
export const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '6ae21f6271db427f12bc';
export const DATABASE_ID = 'mail';
export const BUCKET_ID = 'attachments';
export const TABLES = {
  mailboxes: 'mailboxes',
  settings: 'settings',
  messages: 'messages',
  drafts: 'drafts',
  contacts: 'contacts',
  labels: 'labels',
  apikeys: 'apikeys',
  config: 'config',
};
