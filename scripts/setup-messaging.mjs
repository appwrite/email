// Connects an email provider to Appwrite Messaging so mail to external
// addresses can be delivered. Mail between Appwrite Email users never needs it.
//
//   APPWRITE_API_KEY=... MAIL_PROVIDER=resend RESEND_API_KEY=... \
//   MAIL_FROM_EMAIL=mail@yourdomain.com node scripts/setup-messaging.mjs
//
// MAIL_PROVIDER is one of: resend, sendgrid, mailgun, smtp. The from address
// must be on a domain verified with that provider. Each message sets Reply-To
// to the sender's Appwrite Email address, so replies come back to the inbox.
import { Client, Messaging, SmtpEncryption } from 'node-appwrite';
import { ENDPOINT, PROJECT_ID } from './config.mjs';

const env = process.env;
const required = (name) => {
  if (!env[name]) {
    console.error(`Set ${name}`);
    process.exit(1);
  }
  return env[name];
};

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(required('APPWRITE_API_KEY'));
const messaging = new Messaging(client);

const providerId = 'email';
const common = {
  providerId,
  name: 'Outbound email',
  fromName: env.MAIL_FROM_NAME || 'Appwrite Email',
  fromEmail: required('MAIL_FROM_EMAIL'),
  enabled: true,
};

const provider = required('MAIL_PROVIDER');
const create = {
  resend: () => messaging.createResendProvider({ ...common, apiKey: required('RESEND_API_KEY') }),
  sendgrid: () => messaging.createSendgridProvider({ ...common, apiKey: required('SENDGRID_API_KEY') }),
  mailgun: () =>
    messaging.createMailgunProvider({
      ...common,
      apiKey: required('MAILGUN_API_KEY'),
      domain: required('MAILGUN_DOMAIN'),
      isEuRegion: env.MAILGUN_EU === 'true',
    }),
  smtp: () =>
    messaging.createSMTPProvider({
      ...common,
      host: required('SMTP_HOST'),
      port: Number(env.SMTP_PORT || 587),
      username: env.SMTP_USERNAME,
      password: env.SMTP_PASSWORD,
      encryption: env.SMTP_ENCRYPTION === 'ssl' ? SmtpEncryption.Ssl : SmtpEncryption.Tls,
    }),
}[provider];

if (!create) {
  console.error('MAIL_PROVIDER must be resend, sendgrid, mailgun or smtp');
  process.exit(1);
}

try {
  await messaging.deleteProvider({ providerId });
  console.log('- replaced existing provider');
} catch {
  // no provider yet
}
const result = await create();
console.log(`✓ ${result.provider} provider ready, sending as ${common.fromName} <${common.fromEmail}>`);
