import {
  QueryClient,
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import { ID, Permission, Query, Role, type Models } from 'appwrite';
import {
  DATABASE_ID,
  TABLES,
  account,
  tablesDB,
  type ContactRow,
  type DraftRow,
  type Folder,
  type LabelRow,
  type MailboxRow,
  type MessageRow,
  type SettingsRow,
} from './appwrite';

export const queryClient = new QueryClient({
  defaultOptions: {
    // Cached data renders instantly; anything older than 30s refreshes quietly in the background.
    queries: { staleTime: 30_000, gcTime: 24 * 3600_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export type View = { folder: Folder; label?: string; q?: string; filter?: 'unread' | 'attachments' | 'starred' };

export const PAGE_SIZE = 50;

// System attributes ($id, $createdAt…) are always returned.
const LIST_COLUMNS = [
  'ownerId', 'folder', 'threadId', 'fromName', 'fromEmail', 'to', 'cc', 'subject', 'snippet', 'date', 'read',
  'starred', 'labels', 'hasAttachments', 'status', 'scheduledAt', 'snoozedUntil', 'messageId', 'spamReason',
];

export const ownerPerms = (uid: string) => [
  Permission.read(Role.user(uid)),
  Permission.update(Role.user(uid)),
  Permission.delete(Role.user(uid)),
];

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function fetchAccount() {
  try {
    return await account.get();
  } catch {
    return null;
  }
}

export function useAccount() {
  return useQuery({ queryKey: ['account'], queryFn: fetchAccount, staleTime: Infinity });
}

export async function fetchMailbox(uid: string) {
  try {
    return await tablesDB.getRow<MailboxRow>({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, rowId: uid });
  } catch (e: any) {
    if (e.code === 404) return null;
    throw e;
  }
}

export function useMailbox(uid?: string) {
  return useQuery({
    queryKey: ['mailbox', uid],
    queryFn: () => fetchMailbox(uid!),
    enabled: !!uid,
    staleTime: Infinity,
  });
}

export const settingsQuery = (uid?: string) =>
  queryOptions({
    queryKey: ['settings', uid],
    queryFn: () => tablesDB.getRow<SettingsRow>({ databaseId: DATABASE_ID, tableId: TABLES.settings, rowId: uid! }),
    enabled: !!uid,
  });

export function useSettings(uid?: string) {
  return useQuery(settingsQuery(uid));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const HIDDEN = ['trash', 'spam'];

function viewQueries(uid: string, view: View) {
  const q: string[] = [Query.equal('ownerId', uid)];
  switch (view.folder) {
    case 'starred':
      q.push(Query.equal('starred', true), Query.notEqual('folder', 'trash'), Query.notEqual('folder', 'spam'));
      break;
    case 'all':
      q.push(Query.equal('folder', ['inbox', 'archive', 'sent']));
      break;
    case 'label':
      q.push(Query.contains('labels', [view.label || '']), Query.notEqual('folder', 'trash'));
      break;
    default:
      q.push(Query.equal('folder', view.folder));
  }
  if (view.filter === 'unread') q.push(Query.equal('read', false));
  if (view.filter === 'attachments') q.push(Query.equal('hasAttachments', true));
  if (view.filter === 'starred' && view.folder !== 'starred') q.push(Query.equal('starred', true));
  if (view.q?.trim()) q.push(Query.search('search', view.q.trim()));
  return q;
}

export function sortAscending(view: View) {
  return view.folder === 'scheduled' || view.folder === 'snoozed';
}

export function matchesView(row: MessageRow, view: View) {
  let ok: boolean;
  switch (view.folder) {
    case 'starred':
      ok = row.starred && !HIDDEN.includes(row.folder);
      break;
    case 'all':
      ok = ['inbox', 'archive', 'sent'].includes(row.folder);
      break;
    case 'label':
      ok = (row.labels || []).includes(view.label || '') && row.folder !== 'trash';
      break;
    default:
      ok = row.folder === view.folder;
  }
  if (view.filter === 'unread' && row.read) ok = false;
  if (view.filter === 'attachments' && !row.hasAttachments) ok = false;
  if (view.filter === 'starred' && !row.starred) ok = false;
  return ok;
}

type RowPage = Models.RowList<MessageRow>;

export const messagesQuery = (uid: string | undefined, view: View) =>
  infiniteQueryOptions({
    queryKey: ['messages', uid, view],
    enabled: !!uid,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      tablesDB.listRows<MessageRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.messages,
        queries: [
          ...viewQueries(uid!, view),
          Query.select(LIST_COLUMNS),
          sortAscending(view) ? Query.orderAsc('date') : Query.orderDesc('date'),
          Query.limit(PAGE_SIZE),
          ...(pageParam ? [Query.cursorAfter(pageParam)] : []),
        ],
        total: !pageParam,
      }),
    getNextPageParam: (last) => (last.rows.length < PAGE_SIZE ? null : last.rows[last.rows.length - 1].$id),
  });

export function useMessages(uid: string | undefined, view: View) {
  return useInfiniteQuery(messagesQuery(uid, view));
}

// Views are compared structurally in query keys, so build them the same way everywhere.
export function makeView(folder: Folder, extra: Partial<Omit<View, 'folder'>> = {}): View {
  return { folder, label: extra.label, q: extra.q, filter: extra.filter };
}

export function prefetchFolder(uid: string, view: View) {
  return queryClient.prefetchInfiniteQuery({ ...messagesQuery(uid, view), staleTime: 30_000 });
}

export function threadQuery(uid: string | undefined, threadId: string | undefined) {
  return {
    queryKey: ['thread', uid, threadId],
    enabled: !!uid && !!threadId,
    queryFn: async () => {
      const { rows } = await tablesDB.listRows<MessageRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.messages,
        queries: [Query.equal('ownerId', uid!), Query.equal('threadId', threadId!), Query.orderAsc('date'), Query.limit(100)],
        total: false,
      });
      return rows;
    },
  };
}

export function useThread(uid: string | undefined, threadId: string | undefined) {
  return useQuery(threadQuery(uid, threadId));
}

// Warm the cache on hover so opening a conversation feels instant.
export function prefetchThread(uid: string, threadId: string) {
  queryClient.prefetchQuery({ ...threadQuery(uid, threadId), staleTime: 30_000 });
}

export function useMessage(id: string | undefined) {
  return useQuery({
    queryKey: ['message', id],
    enabled: !!id,
    queryFn: () => tablesDB.getRow<MessageRow>({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId: id! }),
  });
}

async function countRows(tableId: string, queries: string[]) {
  const { total } = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId,
    queries: [...queries, Query.limit(1), Query.select(['ownerId'])],
  });
  return total;
}

export function useCounts(uid?: string) {
  return useQuery(countsQuery(uid));
}

export const countsQuery = (uid?: string) =>
  queryOptions({
    queryKey: ['counts', uid],
    enabled: !!uid,
    staleTime: 10_000,
    queryFn: async () => {
      const own = Query.equal('ownerId', uid!);
      const [inbox, drafts, scheduled, snoozed, spam] = await Promise.all([
        countRows(TABLES.messages, [own, Query.equal('folder', 'inbox'), Query.equal('read', false)]),
        countRows(TABLES.drafts, [own]),
        countRows(TABLES.messages, [own, Query.equal('folder', 'scheduled')]),
        countRows(TABLES.messages, [own, Query.equal('folder', 'snoozed')]),
        countRows(TABLES.messages, [own, Query.equal('folder', 'spam'), Query.equal('read', false)]),
      ]);
      return { inbox, drafts, scheduled, snoozed, spam } as Record<string, number>;
    },
  });

// --- Cache surgery so the UI updates instantly (optimistic + realtime) ------

function sortRows(rows: MessageRow[], view: View) {
  const dir = sortAscending(view) ? 1 : -1;
  return [...rows].sort((a, b) => dir * (new Date(a.date).getTime() - new Date(b.date).getTime()));
}

export function upsertRowInCaches(row: MessageRow, opts: { insert?: boolean } = {}) {
  queryClient
    .getQueryCache()
    .findAll({ queryKey: ['messages'] })
    .forEach((query) => {
      const view = query.queryKey[2] as View;
      queryClient.setQueryData<InfiniteData<RowPage>>(query.queryKey, (data) => {
        if (!data) return data;
        const present = data.pages.some((p) => p.rows.some((r) => r.$id === row.$id));
        const belongs = matchesView(row, view) && !view.q;
        if (!present && !(opts.insert && belongs)) return data;
        const pages = data.pages.map((p, i) => {
          let rows = p.rows.map((r) => (r.$id === row.$id ? { ...r, ...row } : r));
          if (!belongs) rows = rows.filter((r) => r.$id !== row.$id);
          if (belongs && !present && i === 0) rows = sortRows([row, ...rows], view);
          const delta = rows.length - p.rows.length;
          return { ...p, rows, total: p.total + (i === 0 ? delta : 0) };
        });
        return { ...data, pages };
      });
    });
  queryClient.setQueriesData<MessageRow[]>({ queryKey: ['thread'] }, (rows) => {
    if (!rows) return rows;
    if (rows.some((r) => r.$id === row.$id)) return rows.map((r) => (r.$id === row.$id ? { ...r, ...row } : r));
    if (opts.insert && rows[0]?.threadId === row.threadId) return [...rows, row];
    return rows;
  });
  queryClient.setQueryData<MessageRow>(['message', row.$id], (old) => (old ? { ...old, ...row } : old));
}

export function removeRowFromCaches(id: string) {
  queryClient.setQueriesData<InfiniteData<RowPage>>({ queryKey: ['messages'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => {
            const rows = p.rows.filter((r) => r.$id !== id);
            return { ...p, rows, total: p.total - (p.rows.length - rows.length) };
          }),
        }
      : data,
  );
  queryClient.setQueriesData<MessageRow[]>({ queryKey: ['thread'] }, (rows) => rows?.filter((r) => r.$id !== id));
}

export function findCachedRow(id: string): MessageRow | undefined {
  for (const [, data] of queryClient.getQueriesData<InfiniteData<RowPage>>({ queryKey: ['messages'] })) {
    for (const p of data?.pages || []) {
      const r = p.rows.find((x) => x.$id === id);
      if (r) return r;
    }
  }
  for (const [, rows] of queryClient.getQueriesData<MessageRow[]>({ queryKey: ['thread'] })) {
    const r = rows?.find((x) => x.$id === id);
    if (r) return r;
  }
  return queryClient.getQueryData<MessageRow>(['message', id]);
}

export async function updateMessages(ids: string[], data: Partial<MessageRow>) {
  const previous = ids.map((id) => findCachedRow(id)).filter(Boolean) as MessageRow[];
  previous.forEach((row) => upsertRowInCaches({ ...row, ...data }));
  try {
    await Promise.all(
      ids.map((rowId) => tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId, data })),
    );
  } catch (e) {
    previous.forEach((row) => upsertRowInCaches(row));
    throw e;
  } finally {
    queryClient.invalidateQueries({ queryKey: ['counts'] });
  }
}

export async function deleteMessagesForever(ids: string[]) {
  ids.forEach(removeRowFromCaches);
  await Promise.all(
    ids.map((rowId) => tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.messages, rowId })),
  );
  queryClient.invalidateQueries({ queryKey: ['counts'] });
}

// ---------------------------------------------------------------------------
// Labels, contacts, drafts
// ---------------------------------------------------------------------------

export function useLabels(uid?: string) {
  return useQuery(labelsQuery(uid));
}

export const labelsQuery = (uid?: string) =>
  queryOptions({
    queryKey: ['labels', uid],
    enabled: !!uid,
    queryFn: async () =>
      (
        await tablesDB.listRows<LabelRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.labels,
          queries: [Query.equal('ownerId', uid!), Query.orderAsc('name'), Query.limit(100)],
          total: false,
        })
      ).rows,
  });

export async function createLabel(uid: string, name: string, color: string) {
  const row = await tablesDB.createRow<LabelRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.labels,
    rowId: ID.unique(),
    data: { ownerId: uid, name, color },
    permissions: ownerPerms(uid),
  });
  queryClient.invalidateQueries({ queryKey: ['labels'] });
  return row;
}

export function useContacts(uid?: string) {
  return useQuery(contactsQuery(uid));
}

export const contactsQuery = (uid?: string) =>
  queryOptions({
    queryKey: ['contacts', uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () =>
      (
        await tablesDB.listRows<ContactRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.contacts,
          queries: [Query.equal('ownerId', uid!), Query.orderDesc('lastContactedAt'), Query.limit(1000)],
          total: false,
        })
      ).rows,
  });

export function useDrafts(uid?: string) {
  return useQuery(draftsQuery(uid));
}

export const draftsQuery = (uid?: string) =>
  queryOptions({
    queryKey: ['drafts', uid],
    enabled: !!uid,
    queryFn: async () =>
      (
        await tablesDB.listRows<DraftRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.drafts,
          queries: [Query.equal('ownerId', uid!), Query.orderDesc('$updatedAt'), Query.limit(100)],
        })
      ).rows,
  });
