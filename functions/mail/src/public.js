// Public REST API and remote MCP server (Streamable HTTP). Callers sign in
// with OAuth 2.1 through this project's OAuth2 server (MCP clients register
// themselves and get one-click sign-in) or use a personal API key.
import { ISSUER, API_SCOPES, PROJECT_AUDIENCE, SCOPE_INFO, authenticate, requireScope } from './lib/auth.js';
import { services } from './lib/appwrite.js';
import { HttpError } from './lib/compose.js';
import { LIST_FOLDERS, MOVE_FOLDERS, getMessage, getThread, listLabels, listMessages, me, send, updateMessages } from './lib/mailapi.js';
import { APP_NAME } from './lib/welcome.js';

const VERSION = '1.0.0';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DOCS_URL = process.env.DOCS_URL || 'https://email.appwrite.network/developers';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
};

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.scheme || 'https';
  return `${proto}://${req.headers['x-forwarded-host'] || req.host}`;
}

// --- MCP tools --------------------------------------------------------------

const ids = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 };
const emails = (description) => ({ type: 'array', items: { type: 'string' }, description });

const TOOLS = [
  {
    name: 'get_mailbox',
    title: 'Get mailbox',
    description: 'Your email address, display name and inbox counts.',
    scope: 'mail.read',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
    run: (svc, auth) => me(svc, auth.userId),
  },
  {
    name: 'list_messages',
    title: 'List or search messages',
    description:
      'List messages newest first, optionally filtered by folder, full-text query, unread or starred. Returns summaries; use read_message for the full body.',
    scope: 'mail.read',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', enum: LIST_FOLDERS, default: 'inbox' },
        query: { type: 'string', description: 'Full-text search across sender, subject and body.' },
        unread: { type: 'boolean', description: 'Only unread messages.' },
        starred: { type: 'boolean', description: 'Only starred messages.' },
        label: { type: 'string', description: 'Only messages with this label ID.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        cursor: { type: 'string', description: 'nextCursor from a previous call, for the next page.' },
      },
    },
    run: (svc, auth, a) => listMessages(svc, auth.userId, a),
  },
  {
    name: 'read_message',
    title: 'Read message',
    description: 'Full message: headers, plain-text body and attachment download links.',
    scope: 'mail.read',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Message ID.' },
        include_html: { type: 'boolean', description: 'Also return the HTML body.' },
      },
    },
    run: (svc, auth, a) => getMessage(svc, auth.userId, a.id, { html: !!a.include_html }),
  },
  {
    name: 'read_thread',
    title: 'Read conversation',
    description: 'Every message in a conversation, oldest first.',
    scope: 'mail.read',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', required: ['thread_id'], properties: { thread_id: { type: 'string' } } },
    run: (svc, auth, a) => getThread(svc, auth.userId, a.thread_id),
  },
  {
    name: 'list_labels',
    title: 'List labels',
    description: 'Your labels with their IDs, for filtering and tagging.',
    scope: 'mail.read',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: {} },
    run: (svc, auth) => listLabels(svc, auth.userId),
  },
  {
    name: 'send_email',
    title: 'Send email',
    description: 'Send a new email from your address. The body is plain text unless html is given.',
    scope: 'mail.send',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      properties: {
        to: emails('Recipients, as "Name <email>" or bare addresses.'),
        cc: emails('Cc recipients.'),
        bcc: emails('Bcc recipients.'),
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain-text body.' },
        html: { type: 'string', description: 'Optional HTML body; replaces body.' },
      },
    },
    run: (svc, auth, a, ctx) => send(svc, auth.userId, { ...a, text: a.body }, ctx.log),
  },
  {
    name: 'reply_to_email',
    title: 'Reply to email',
    description: 'Reply in the same conversation. Recipients and subject are filled in from the original.',
    scope: 'mail.send',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      required: ['message_id', 'body'],
      properties: {
        message_id: { type: 'string', description: 'ID of the message to reply to.' },
        body: { type: 'string', description: 'Plain-text reply.' },
        reply_all: { type: 'boolean', description: 'Include everyone on the original message.' },
      },
    },
    run: (svc, auth, a, ctx) => send(svc, auth.userId, { replyTo: a.message_id, replyAll: !!a.reply_all, text: a.body }, ctx.log),
  },
  {
    name: 'update_messages',
    title: 'Update messages',
    description: 'Mark read or unread, star, label, or move messages to inbox, archive, spam or trash.',
    scope: 'mail.modify',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    inputSchema: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: { ...ids, description: 'Message IDs.' },
        read: { type: 'boolean' },
        starred: { type: 'boolean' },
        move_to: { type: 'string', enum: MOVE_FOLDERS },
        add_labels: { type: 'array', items: { type: 'string' }, description: 'Label IDs to add.' },
        remove_labels: { type: 'array', items: { type: 'string' }, description: 'Label IDs to remove.' },
      },
    },
    run: (svc, auth, a) =>
      updateMessages(svc, auth.userId, a.ids, {
        read: a.read,
        starred: a.starred,
        folder: a.move_to,
        addLabels: a.add_labels,
        removeLabels: a.remove_labels,
      }),
  },
];

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRpc(msg, ctx) {
  const { id, method, params = {} } = msg || {};
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return rpcError(id ?? null, -32600, 'Invalid request');
  // Notifications get no response.
  if (id === undefined || id === null) return null;
  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mail', title: APP_NAME, version: VERSION },
        instructions: `Tools for the signed-in user's ${APP_NAME} mailbox. List or search with list_messages, open one with read_message, and confirm with the user before sending or deleting.`,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.filter((t) => ctx.auth.scopes.includes(t.scope)).map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        requireScope(ctx.auth, tool.scope);
        const data = await tool.run(ctx.svc, ctx.auth, params.arguments || {}, ctx);
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data });
      } catch (e) {
        if (!(e instanceof HttpError) && !(e.code >= 400 && e.code < 500)) ctx.error(`${tool.name}: ${e.stack || e.message}`);
        return rpcResult(id, { content: [{ type: 'text', text: e.message || 'Something went wrong.' }], isError: true });
      }
    }
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// --- REST routes ------------------------------------------------------------

const list = (v) => (v === undefined ? undefined : String(v).split(',').map((s) => s.trim()).filter(Boolean));
const flag = (v) => v === 'true' || v === '1';

const REST = [
  ['GET', /^\/v1\/me$/, 'mail.read', (c) => me(c.svc, c.auth.userId)],
  [
    'GET',
    /^\/v1\/messages$/,
    'mail.read',
    (c) =>
      listMessages(c.svc, c.auth.userId, {
        folder: c.query.folder,
        query: c.query.q,
        unread: flag(c.query.unread),
        starred: flag(c.query.starred),
        label: c.query.label,
        limit: c.query.limit,
        cursor: c.query.cursor,
      }),
  ],
  ['GET', /^\/v1\/messages\/([^/]+)$/, 'mail.read', (c, [id]) => getMessage(c.svc, c.auth.userId, id, { html: flag(c.query.html) })],
  ['GET', /^\/v1\/threads\/([^/]+)$/, 'mail.read', (c, [id]) => getThread(c.svc, c.auth.userId, id, { html: flag(c.query.html) })],
  ['GET', /^\/v1\/labels$/, 'mail.read', (c) => listLabels(c.svc, c.auth.userId)],
  ['PATCH', /^\/v1\/messages\/([^/]+)$/, 'mail.modify', (c, [id]) => updateMessages(c.svc, c.auth.userId, [id], c.body).then((r) => r.updated[0])],
  ['PATCH', /^\/v1\/messages$/, 'mail.modify', (c) => updateMessages(c.svc, c.auth.userId, c.body.ids, c.body)],
  ['DELETE', /^\/v1\/messages\/([^/]+)$/, 'mail.modify', (c, [id]) => updateMessages(c.svc, c.auth.userId, [id], { folder: 'trash' }).then((r) => r.updated[0])],
  ['POST', /^\/v1\/messages$/, 'mail.send', (c) => send(c.svc, c.auth.userId, c.body, c.log)],
];

function protectedResource(base) {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [ISSUER],
    scopes_supported: API_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: `${APP_NAME} MCP`,
    resource_documentation: DOCS_URL,
  };
}

function openapi(base) {
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const ok = (schema) => ({ 200: { description: 'OK', content: { 'application/json': { schema } } } });
  const sec = (scope) => [{ oauth2: [scope] }, { apiKey: [] }];
  const q = (name, type, description) => ({ name, in: 'query', schema: { type }, description });
  return {
    openapi: '3.1.0',
    info: { title: `${APP_NAME} API`, version: VERSION, description: `Read, search, send and organize email. Docs: ${DOCS_URL}` },
    servers: [{ url: base }],
    components: {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: `${ISSUER}/authorize`,
              tokenUrl: `${ISSUER}/token`,
              refreshUrl: `${ISSUER}/token`,
              scopes: SCOPE_INFO,
            },
          },
        },
        apiKey: { type: 'http', scheme: 'bearer', description: 'Personal API key (mk_…) from Settings.' },
      },
      schemas: {
        Summary: {
          type: 'object',
          properties: {
            id: { type: 'string' }, threadId: { type: 'string' }, folder: { type: 'string' }, from: { type: 'string' },
            to: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, snippet: { type: 'string' },
            date: { type: 'string', format: 'date-time' }, read: { type: 'boolean' }, starred: { type: 'boolean' },
            labels: { type: 'array', items: { type: 'string' } }, hasAttachments: { type: 'boolean' },
          },
        },
        Message: { allOf: [ref('Summary'), { type: 'object', properties: { text: { type: 'string' }, html: { type: 'string' }, attachments: { type: 'array', items: { type: 'object' } } } }] },
        Changes: {
          type: 'object',
          properties: {
            read: { type: 'boolean' }, starred: { type: 'boolean' }, folder: { type: 'string', enum: MOVE_FOLDERS },
            addLabels: { type: 'array', items: { type: 'string' } }, removeLabels: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    paths: {
      '/v1/me': { get: { summary: 'Your mailbox', security: sec('mail.read'), responses: ok({ type: 'object' }) } },
      '/v1/messages': {
        get: {
          summary: 'List or search messages',
          security: sec('mail.read'),
          parameters: [
            q('folder', 'string', LIST_FOLDERS.join(' | ')), q('q', 'string', 'Full-text search'), q('unread', 'boolean', 'Only unread'),
            q('starred', 'boolean', 'Only starred'), q('label', 'string', 'Label ID'), q('limit', 'integer', '1–100, default 20'),
            q('cursor', 'string', 'nextCursor from the previous page'),
          ],
          responses: ok({ type: 'object', properties: { total: { type: 'integer' }, messages: { type: 'array', items: ref('Summary') }, nextCursor: { type: ['string', 'null'] } } }),
        },
        post: {
          summary: 'Send a message or reply',
          security: sec('mail.send'),
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    to: { type: 'array', items: { type: 'string' } }, cc: { type: 'array', items: { type: 'string' } },
                    bcc: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, text: { type: 'string' },
                    html: { type: 'string' }, replyTo: { type: 'string', description: 'Message ID to reply to' }, replyAll: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: ok({ type: 'object' }),
        },
        patch: {
          summary: 'Update many messages',
          security: sec('mail.modify'),
          requestBody: { content: { 'application/json': { schema: { allOf: [ref('Changes'), { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } }] } } } },
          responses: ok({ type: 'object' }),
        },
      },
      '/v1/messages/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: { summary: 'Read a message', security: sec('mail.read'), parameters: [q('html', 'boolean', 'Include HTML body')], responses: ok(ref('Message')) },
        patch: { summary: 'Update a message', security: sec('mail.modify'), requestBody: { content: { 'application/json': { schema: ref('Changes') } } }, responses: ok(ref('Summary')) },
        delete: { summary: 'Move a message to Trash', security: sec('mail.modify'), responses: ok(ref('Summary')) },
      },
      '/v1/threads/{id}': {
        get: { summary: 'Read a conversation', security: sec('mail.read'), parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: ok({ type: 'object' }) },
      },
      '/v1/labels': { get: { summary: 'List labels', security: sec('mail.read'), responses: ok({ type: 'object' }) } },
    },
  };
}

// --- Entry point --------------------------------------------------------------

export default async ({ req, res, log, error }) => {
  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  const base = baseUrl(req);
  const json = (data, status = 200, headers = {}) => res.json(data, status, { ...CORS, ...headers });

  if (req.method === 'OPTIONS') return res.send('', 204, CORS);
  if (req.method === 'GET' && path === '/') {
    return json({ name: `${APP_NAME} API`, version: VERSION, docs: DOCS_URL, openapi: `${base}/openapi.json`, mcp: `${base}/mcp` });
  }
  if (req.method === 'GET' && /^\/\.well-known\/oauth-protected-resource(\/mcp)?$/.test(path)) return json(protectedResource(base));
  if (req.method === 'GET' && path === '/openapi.json') return json(openapi(base));

  const svc = services(req.headers['x-appwrite-key']);
  const challenge = (status, code, description) => ({
    'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"${
      // Header values must be ASCII.
      code ? `, error="${code}", error_description="${description.replace(/[^\x20-\x7e]|"/g, '').trim()}"` : ''
    }${status === 403 ? `, scope="${API_SCOPES.join(' ')}"` : ''}`,
  });
  // REST also takes project-audience tokens from clients that skip resource indicators.
  const auth = async () => authenticate(req, svc, [`${base}/mcp`, base, `${base}/`, PROJECT_AUDIENCE]);

  if (path === '/mcp') {
    if (req.method !== 'POST') return json({ message: 'Use POST for MCP requests.' }, 405, { allow: 'POST, OPTIONS' });
    let caller;
    try {
      // Only tokens bound to this server, so one minted for another API can't be replayed here.
      caller = await authenticate(req, svc, [`${base}/mcp`]);
    } catch (e) {
      return json({ message: e.message }, 401, challenge(401, /^Bearer\s+\S/i.test(req.headers.authorization || '') ? 'invalid_token' : '', e.message));
    }
    const body = req.bodyJson;
    const ctx = { svc, auth: caller, log, error };
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleRpc(m, ctx)))).filter(Boolean);
      return out.length ? json(out) : res.send('', 202, CORS);
    }
    const out = await handleRpc(body, ctx);
    return out ? json(out) : res.send('', 202, CORS);
  }

  for (const [method, pattern, scope, run] of REST) {
    const m = path.match(pattern);
    if (!m || method !== req.method) continue;
    try {
      const caller = await auth();
      requireScope(caller, scope);
      const ctx = { svc, auth: caller, query: req.query || {}, body: req.method === 'GET' ? {} : req.bodyJson || {}, log };
      return json(await run(ctx, m.slice(1).map(decodeURIComponent)));
    } catch (e) {
      const status = e instanceof HttpError ? e.code : e.code >= 400 && e.code < 500 ? e.code : 500;
      if (status >= 500) error(`${req.method} ${path}: ${e.stack || e.message}`);
      const headers =
        status === 401
          ? challenge(401, 'invalid_token', e.message)
          : status === 403
            ? challenge(403, 'insufficient_scope', e.message)
            : status === 429 && e.retryAfter
              ? { 'retry-after': String(e.retryAfter) }
              : {};
      return json({ message: status >= 500 ? 'Something went wrong.' : e.message }, status, headers);
    }
  }
  return json({ message: `No route for ${req.method} ${path}. See ${base}/openapi.json.` }, 404);
};
