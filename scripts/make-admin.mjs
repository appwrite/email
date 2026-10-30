// Makes an existing account an admin, for installs that already had users
// before the admin panel existed. A fresh install needs none of this: the
// first person to claim an address becomes the admin automatically.
//
//   APPWRITE_API_KEY=... node scripts/make-admin.mjs you@example.com [--close-signups]
import { Client, Permission, Project, Query, Role, TablesDB, Users } from 'node-appwrite';
import { DATABASE_ID, ENDPOINT, PROJECT_ID, TABLES } from './config.mjs';

const key = process.env.APPWRITE_API_KEY;
const email = process.argv[2];
if (!key || !email) {
  console.error('Usage: APPWRITE_API_KEY=... node scripts/make-admin.mjs <sign-in email> [--close-signups]');
  process.exit(1);
}
const close = process.argv.includes('--close-signups');

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(key);
const users = new Users(client);
const tablesDB = new TablesDB(client);

const { users: found } = await users.list({ queries: [Query.equal('email', email.toLowerCase())] });
const user = found[0];
if (!user) {
  console.error(`No account signs in with ${email}.`);
  process.exit(1);
}
await users.updateLabels({ userId: user.$id, labels: [...new Set([...(user.labels || []), 'admin'])] });
console.log(`✓ ${user.name || email} is an admin`);

if (close) {
  await tablesDB.upsertRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.config,
    rowId: 'app',
    data: { signupsOpen: false },
    permissions: [Permission.read(Role.any())],
  });
  const { total } = await users.list({ queries: [Query.limit(1)] });
  await new Project(client).updateUserLimitPolicy({ total });
  console.log(`✓ Sign-ups closed (user cap ${total})`);
}
