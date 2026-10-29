# Appwrite Email

A fast, Apple-style email service built entirely on Appwrite. Every incoming email runs an Appwrite Function through the new **email trigger**, lands in TablesDB and Storage, and streams to the browser over Realtime.

- **Live:** https://email.appwrite.network
- **Project:** `Appwrite Email` (`6ae21f6271db427f12bc`, Frankfurt) in the Appwrite Official organization
- **Addresses:** `<handle>@inbox-6ae21f6271db427f12bc.appwrite.email` (the legacy `<handle>+inbox@6ae21f6271db427f12bc.appwrite.email` still arrives)

## How it uses Appwrite

| Service | Used for |
| --- | --- |
| **Auth** | Email/password, email-code sign-in, verification, password recovery, TOTP two-factor with recovery codes, session management, account prefs (theme/accent sync across devices) |
| **Functions** | `inbox` — email trigger that parses, threads, applies rules, stores attachments, sends vacation replies and forwards. `api` — HTTP API for claiming an address, sending, scheduling, emptying trash and deleting the account. `maintenance` — cron every minute for send-later, snooze wake-ups, delivery status and trash purging |
| **Databases (TablesDB)** | `mailboxes`, `settings`, `messages`, `drafts`, `contacts`, `labels`, with row-level permissions, a full-text search index and bulk row updates/deletes |
| **Storage** | `attachments` bucket (encrypted, antivirus, 25 MB) plus file tokens so inline `cid:` images and downloads work from plain URLs |
| **Messaging** | Outbound mail to external addresses, with Reply-To set to the sender's Appwrite Email address so replies come back in |
| **Realtime** | New mail, read/star/move changes, drafts, labels and settings sync instantly across tabs |
| **Avatars** | Sender brand icons (favicons), QR codes for your address and the 2FA setup |
| **Sites** | Static TanStack Start SPA with prerendered landing and auth pages, served from `email.appwrite.network` |

## Features

Three-pane mail with conversation threading, unread/starred/attachment filters, full-text search, multi-select and drag-to-folder/label, snooze, send later, undo send, drafts with autosave, rich-text compose with attachments (drag, drop and paste), reply/reply-all/forward with quoting, sandboxed HTML rendering with remote-image blocking and quoted-text folding, Quick Look previews, labels, server-side rules, blocked senders, vacation replies, auto-forwarding, contacts with history, a ⌘K command palette, Gmail-style keyboard shortcuts, desktop notifications, light/dark/auto themes with macOS accent colors, and a mobile layout.

## Address format

Appwrite routes any local part at `<FUNCTION_ID>-<PROJECT_ID>.appwrite.email` to that function, so every user gets `<handle>@inbox-6ae21f6271db427f12bc.appwrite.email`, and `<handle>+anything@…` reaches the same mailbox. The earlier `<handle>+inbox@<PROJECT_ID>.appwrite.email` form is still routed and still delivers. For bare `<handle>@yourdomain.com` addresses, connect a custom email domain to the `inbox` function and add it to the function's `CUSTOM_DOMAINS` variable.

## Spam

The inbox function reads the gateway's verdict from `email.spam` (`{ score, verdict, model }`, score 0–1, ham below 0.2, spam at 0.99 and above). `spam` goes to Junk unless the sender is one of the user's contacts or a rule moves it elsewhere. `unsure` stays in the Inbox, flagged "Possible spam" in the list and reader, with one-click Move to Junk. When there is no gateway verdict, Rspamd/SpamAssassin headers in the message are a fallback. The score and reason are stored on the message.

## Repository

```
functions/mail/      One codebase, three entrypoints
  src/inbox.js         Email trigger
  src/api.js           HTTP API (execute: users)
  src/maintenance.js   Scheduled jobs
  src/lib/             Delivery, sending, parsing helpers
web/                 TanStack Start app (React 19, TanStack Router + Query, Tailwind v4, Motion)
scripts/
  setup.mjs            Database, tables, indexes, bucket (idempotent)
  deploy-functions.mjs Creates/updates functions, deploys code, turns on the email trigger
  deploy-site.mjs      Creates/updates the Site and deploys web/
  setup-messaging.mjs  Connects Resend, SendGrid, Mailgun or SMTP to Messaging
```

## Develop and deploy

All scripts need an API key for the project in `APPWRITE_API_KEY`.

```bash
npm install && npm --prefix web install
```

```bash
node scripts/setup.mjs
```

```bash
node scripts/deploy-functions.mjs
```

```bash
node scripts/deploy-site.mjs
```

```bash
npm --prefix web run dev
```

## Sending to external addresses

Mail between Appwrite Email users is delivered instantly by the `api` function. Mail to other domains goes through Appwrite Messaging, which needs a provider and a verified sender domain:

```bash
MAIL_PROVIDER=resend RESEND_API_KEY=re_... MAIL_FROM_EMAIL=mail@yourdomain.com node scripts/setup-messaging.mjs
```

Messaging sends from the provider's address (for example `Appwrite Email <mail@yourdomain.com>`) and sets Reply-To to the sender's Appwrite Email address.
