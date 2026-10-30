// Authenticates calls to the public API and MCP server. Two credentials work:
// OAuth 2.1 access tokens issued by this project's OAuth2 server (verified
// offline against its JWKS), and personal API keys (`mk_…`, stored as hashes).
import { createHash } from 'node:crypto';
import { Query } from 'node-appwrite';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DATABASE_ID, ENDPOINT, PROJECT_ID, TABLES } from './appwrite.js';
import { HttpError } from './compose.js';

export const API_SCOPES = ['mail.read', 'mail.send', 'mail.modify'];

export const SCOPE_INFO = {
  'mail.read': 'Read your messages, threads, labels and mailbox details',
  'mail.send': 'Send email and replies from your address',
  'mail.modify': 'Mark, star, label, archive, move and delete messages',
};

export const ISSUER = `${ENDPOINT}/oauth2/${PROJECT_ID}`;
// Tokens requested without a resource indicator carry the project audience.
// Only the REST API accepts it; MCP tokens must name the MCP resource.
export const PROJECT_AUDIENCE = `${ENDPOINT}/${PROJECT_ID}`;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export function hashKey(secret) {
  return createHash('sha256').update(secret).digest('hex');
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function fromApiKey(svc, secret) {
  const { rows } = await svc.tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.apikeys,
    queries: [Query.equal('hash', hashKey(secret)), Query.limit(1)],
  });
  const key = rows[0];
  if (!key) throw new HttpError(401, 'Invalid API key.');
  // Record usage at most every five minutes.
  if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 5 * 60_000) {
    svc.tablesDB
      .updateRow({ databaseId: DATABASE_ID, tableId: TABLES.apikeys, rowId: key.$id, data: { lastUsedAt: new Date().toISOString() } })
      .catch(() => {});
  }
  return { userId: key.ownerId, scopes: key.scopes || [], via: 'key', clientId: null };
}

async function fromAccessToken(token, resources) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: ISSUER, typ: 'at+jwt' }));
  } catch {
    throw new HttpError(401, 'The access token is invalid or expired.');
  }
  const aud = [].concat(payload.aud || []);
  if (!aud.some((a) => resources.includes(a))) {
    throw new HttpError(401, 'The access token was issued for a different resource.');
  }
  if (!payload.sub) throw new HttpError(401, 'The access token has no user.');
  return {
    userId: String(payload.sub),
    scopes: String(payload.scope || '').split(' ').filter(Boolean),
    via: 'oauth',
    clientId: payload.client_id || null,
  };
}

/** Resolves the caller, or throws a 401 HttpError. `resources` are the audiences this server accepts. */
export async function authenticate(req, svc, resources) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'Send an access token or API key as `Authorization: Bearer <token>`.');
  return token.startsWith('mk_') ? fromApiKey(svc, token) : fromAccessToken(token, resources);
}

export function requireScope(auth, scope) {
  if (!auth.scopes.includes(scope)) {
    throw Object.assign(new HttpError(403, `This credential is missing the ${scope} scope.`), { scope });
  }
}
