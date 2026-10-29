// Moves every mailbox to the <handle>@inbox-<project>.appwrite.email address.
// Mail to the legacy <handle>+inbox@<project>.appwrite.email form still arrives.
import { Client, Query, TablesDB } from 'node-appwrite';
import { DATABASE_ID, ENDPOINT, PROJECT_ID, TABLES } from './config.mjs';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(process.env.APPWRITE_API_KEY);
const tablesDB = new TablesDB(client);
const domain = `inbox-${PROJECT_ID}.appwrite.email`;

const { rows } = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, queries: [Query.limit(1000)] });
for (const row of rows) {
  const address = `${row.handle}@${domain}`;
  if (row.address === address) continue;
  await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLES.mailboxes, rowId: row.$id, data: { address } });
  console.log(`${row.address} -> ${address}`);
}
