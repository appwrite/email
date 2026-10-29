// Creates the Appwrite Site (static TanStack Start SPA) and deploys web/.
//
//   APPWRITE_API_KEY=... node scripts/deploy-site.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Adapter, BuildRuntime, Client, Framework, ID, Proxy, Sites } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { ENDPOINT, PROJECT_ID } from './config.mjs';

const key = process.env.APPWRITE_API_KEY;
if (!key) {
  console.error('Set APPWRITE_API_KEY');
  process.exit(1);
}

const SITE_ID = 'web';
const DOMAINS = ['email.appwrite.network', 'appwrite-email.appwrite.network', 'aw-email.appwrite.network'];

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(key);
const sites = new Sites(client);
const proxy = new Proxy(client);

const settings = {
  name: 'Appwrite Email',
  framework: Framework.Tanstackstart,
  buildRuntime: BuildRuntime.Node22,
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: './dist/client',
  adapter: Adapter.Static,
  fallbackFile: '_shell.html',
  buildSpecification: 's-2vcpu-2gb',
};

try {
  await sites.create({ siteId: SITE_ID, ...settings });
  console.log(`+ site ${SITE_ID}`);
} catch (e) {
  if (e.code !== 409) throw e;
  await sites.update({ siteId: SITE_ID, ...settings });
}

// The web app reads its endpoint and project at build time.
const vars = { VITE_APPWRITE_ENDPOINT: ENDPOINT, VITE_APPWRITE_PROJECT_ID: PROJECT_ID };
const existing = (await sites.listVariables({ siteId: SITE_ID })).variables;
for (const [k, value] of Object.entries(vars)) {
  const v = existing.find((x) => x.key === k);
  if (!v) await sites.createVariable({ siteId: SITE_ID, variableId: ID.unique(), key: k, value, secret: false });
  else if (v.value !== value) await sites.updateVariable({ siteId: SITE_ID, variableId: v.$id, key: k, value, secret: false });
}

const dir = mkdtempSync(join(tmpdir(), 'appwrite-email-site-'));
const code = join(dir, 'code.tar.gz');
execFileSync('tar', ['-czf', code, '--exclude', 'node_modules', '--exclude', 'dist', '--exclude', '.tanstack', '--exclude', '.output', '-C', 'web', '.']);

const deployment = await sites.createDeployment({
  siteId: SITE_ID,
  code: InputFile.fromPath(code, 'code.tar.gz'),
  activate: true,
});
process.stdout.write(`Building ${deployment.$id}`);
for (;;) {
  const d = await sites.getDeployment({ siteId: SITE_ID, deploymentId: deployment.$id });
  if (d.status === 'ready') break;
  if (d.status === 'failed' || d.status === 'canceled') {
    console.error(`\nDeployment ${d.status}:\n${d.buildLogs}`);
    process.exit(1);
  }
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(' ready');

const { rules } = await proxy.listRules();
let rule = rules.find((r) => r.deploymentResourceId === SITE_ID || r.trigger === 'manual');
if (!rules.some((r) => DOMAINS.includes(r.domain))) {
  for (const domain of DOMAINS) {
    try {
      rule = await proxy.createSiteRule({ domain, siteId: SITE_ID });
      console.log(`+ domain ${domain}`);
      break;
    } catch (e) {
      console.log(`  ${domain}: ${e.message}`);
    }
  }
}
const all = (await proxy.listRules()).rules.map((r) => r.domain);
console.log('Live at:', all.map((d) => `https://${d}`).join(', '));
