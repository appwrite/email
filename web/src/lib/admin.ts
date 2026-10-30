import type { Models } from 'appwrite';
import { callApi } from './api';
import { DATABASE_ID, TABLES, tablesDB } from './appwrite';

export type Account = {
  id: string;
  name: string;
  email: string;
  status: boolean;
  admin: boolean;
  emailVerification: boolean;
  mfa: boolean;
  createdAt: string;
  accessedAt: string | null;
  address: string | null;
  handle: string | null;
  messages: number;
};

export type AdminOverview = { signupsOpen: boolean; accounts: Account[] };

export const isAdmin = (user?: Models.User<Models.Preferences> | null) => !!user?.labels?.includes('admin');

/** Whether anyone may sign up. Readable without signing in. */
export async function fetchSignupsOpen(): Promise<boolean> {
  try {
    const row = await tablesDB.getRow<Models.Row & { signupsOpen: boolean }>({ databaseId: DATABASE_ID, tableId: TABLES.config, rowId: 'app' });
    return !!row.signupsOpen;
  } catch (e: any) {
    // No config yet: a fresh install, where the first sign-up becomes the admin.
    return e?.code === 404;
  }
}

export const adminApi = {
  overview: () => callApi<AdminOverview>('GET', '/admin'),
  setSignups: (signupsOpen: boolean) => callApi<{ signupsOpen: boolean }>('PATCH', '/admin/config', { signupsOpen }),
  create: (data: { name: string; handle: string; email: string; password: string; admin: boolean }) => callApi<{ userId: string }>('POST', '/admin/accounts', data),
  update: (userId: string, data: { name?: string; password?: string; admin?: boolean; blocked?: boolean; signOut?: boolean }) =>
    callApi('PATCH', '/admin/accounts', { userId, ...data }),
  remove: (userId: string) => callApi('POST', '/admin/accounts/delete', { userId }),
};

/** A readable random password: three groups of letters and digits. */
export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}`;
}
