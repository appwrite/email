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
