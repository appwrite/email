import { account } from './appwrite';
import { clearPersistedCache } from './persist';
import { queryClient } from './queries';

// Ends the session(s) and forgets every cached message on this device.
export async function signOut(everywhere = false) {
  if (everywhere) await account.deleteSessions().catch(() => {});
  else await account.deleteSession({ sessionId: 'current' }).catch(() => {});
  forgetDevice();
}

// Drops every cached query, including ones still in flight, so nothing
// fetched under a previous (or expired) session can land in the cache later.
export function forgetDevice() {
  queryClient.cancelQueries();
  queryClient.clear();
  clearPersistedCache();
}

// Where to return after signing in or creating an address, such as the OAuth
// consent screen. Same-origin paths only.
const AFTER_AUTH_KEY = 'ae:after-auth';

export function setAfterAuth(path: string) {
  try {
    sessionStorage.setItem(AFTER_AUTH_KEY, path);
  } catch {
    // storage may be unavailable
  }
}

export function takeAfterAuth(): string | null {
  try {
    const path = sessionStorage.getItem(AFTER_AUTH_KEY);
    sessionStorage.removeItem(AFTER_AUTH_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}
