// Creates or updates the functions and deploys functions/mail to each.
//
//   APPWRITE_API_KEY=... node scripts/deploy-functions.mjs [inbox api public maintenance]
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, Functions, Proxy, Users } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { ENDPOINT, PROJECT_ID } from './config.mjs';

const key = process.env.APPWRITE_API_KEY;
if (!key) {
  console.error('Set APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(key);
const functions = new Functions(client);
const users = new Users(client);
const proxy = new Proxy(client);

const DATA_SCOPES = [
  'rows.read', 'rows.write', 'files.read', 'files.write', 'tokens.read', 'tokens.write',
  'users.read', 'targets.read', 'targets.write', 'messages.read', 'messages.write',
];

const FUNCTIONS = [
  {
    functionId: 'inbox',
    name: 'Inbox',
    entrypoint: 'src/inbox.js',
    execute: [],
    timeout: 60,
    schedule: '',
    scopes: DATA_SCOPES,
    runtimeSpecification: 's-1vcpu-1gb',
    emailEnabled: true,
  },
  {
    functionId: 'api',
    name: 'API',
    entrypoint: 'src/api.js',
    execute: ['users'],
    timeout: 30,
    schedule: '',
    scopes: [...DATA_SCOPES, 'users.write'],
    runtimeSpecification: 's-1vcpu-1gb',
  },
  {
    // Public REST API and remote MCP server; callers authenticate with OAuth
    // access tokens or personal API keys, so anyone may execute it.
    functionId: 'public',
    name: 'Public API and MCP',
    entrypoint: 'src/public.js',
    execute: ['any'],
    timeout: 30,
    schedule: '',
    scopes: DATA_SCOPES,
    runtimeSpecification: 's-1vcpu-1gb',
    domains: (process.env.PUBLIC_DOMAINS || 'email-api.appwrite.network,mail-api.appwrite.network').split(','),
  },
  {
    functionId: 'maintenance',
    name: 'Maintenance',
    entrypoint: 'src/maintenance.js',
    execute: [],
    timeout: 120,
    schedule: '* * * * *',
    scopes: DATA_SCOPES,
    runtimeSpecification: 's-0.5vcpu-512mb',
  },
];

const only = process.argv.slice(2);
const selected = only.length ? FUNCTIONS.filter((f) => only.includes(f.functionId)) : FUNCTIONS;

function settings(f) {
  return {
    name: f.name,
    runtime: 'node-22',
    execute: f.execute,
    events: [],
    schedule: f.schedule,
    timeout: f.timeout,
    enabled: true,
    logging: true,
    entrypoint: f.entrypoint,
    commands: 'npm install --omit=dev',
    scopes: f.scopes,
    buildSpecification: 's-2vcpu-2gb',
    runtimeSpecification: f.runtimeSpecification,
  };
}

// node-appwrite's functions.update() does not send `emailEnabled` yet, so
// call PUT /functions/:id directly with the full body, like the Console does.
async function putFunction(functionId, body) {
  const res = await fetch(`${ENDPOINT}/functions/${functionId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-appwrite-project': PROJECT_ID, 'x-appwrite-key': key },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PUT /functions/${functionId}: ${json.message}`);
  return json;
}

async function ensureRecipientsUser() {
  try {
    await users.create({ userId: 'recipients', name: 'External recipients' });
    console.log('+ user recipients');
  } catch (e) {
    if (e.code !== 409) throw e;
  }
}

function packageCode() {
  const dir = mkdtempSync(join(tmpdir(), 'appwrite-email-'));
  const file = join(dir, 'code.tar.gz');
  execFileSync('tar', ['-czf', file, '--exclude', 'node_modules', '-C', 'functions/mail', '.']);
  return file;
}

async function waitForDeployment(functionId, deploymentId) {
  for (let i = 0; i < 120; i++) {
    const d = await functions.getDeployment({ functionId, deploymentId });
    if (d.status === 'ready') return d;
    if (d.status === 'failed' || d.status === 'canceled') {
      throw new Error(`Deployment ${deploymentId} ${d.status}:\n${d.buildLogs}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for ${functionId} deployment`);
}

// Gives a function its first available domain from the list, once.
async function ensureDomain(functionId, domains) {
  const { rules } = await proxy.listRules();
  const existing = rules.find((r) => r.deploymentResourceId === functionId && domains.includes(r.domain));
  if (existing) return console.log(`  ${functionId} at https://${existing.domain}`);
  for (const domain of domains) {
    try {
      await proxy.createFunctionRule({ domain, functionId });
      return console.log(`+ domain https://${domain} → ${functionId}`);
    } catch (e) {
      console.log(`  ${domain}: ${e.message}`);
    }
  }
}

await ensureRecipientsUser();
const code = packageCode();

await Promise.all(
  selected.map(async (f) => {
    try {
      await functions.create({ functionId: f.functionId, ...settings(f) });
      console.log(`+ function ${f.functionId}`);
    } catch (e) {
      if (e.code !== 409) throw e;
    }
    await putFunction(f.functionId, { ...settings(f), ...(f.emailEnabled ? { emailEnabled: true } : {}) });

    const deployment = await functions.createDeployment({
      functionId: f.functionId,
      code: InputFile.fromPath(code, 'code.tar.gz'),
      activate: true,
    });
    await waitForDeployment(f.functionId, deployment.$id);
    if (f.domains) await ensureDomain(f.functionId, f.domains);
    const fn = await functions.get({ functionId: f.functionId });
    console.log(
      `✓ ${f.functionId} deployed (${deployment.$id})${fn.emailEnabled ? ` · email trigger on` : ''}`,
    );
  }),
);
