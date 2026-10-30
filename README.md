# Appwrite Email

A fast, Apple-style email service built entirely on Appwrite. Every incoming email runs an Appwrite Function through the new **email trigger**, lands in TablesDB and Storage, and streams to the browser over Realtime.

- **Live:** https://email.appwrite.network
- **Project:** `Appwrite Email` (`6ae21f6271db427f12bc`, Frankfurt) in the Appwrite Official organization
- **Addresses:** `<handle>@inbox-6ae21f6271db427f12bc.appwrite.email` (the legacy `<handle>+inbox@6ae21f6271db427f12bc.appwrite.email` still arrives)

## How it uses Appwrite

| Service | Used for |
| --- | --- |
| **Auth** | Email/password, email-code sign-in, verification, password recovery, TOTP two-factor with recovery codes, session management, account prefs, and the **OAuth2 server** that signs in API and MCP clients |
| **Functions** | `inbox` — email trigger that parses, threads, applies rules, stores attachments, sends vacation replies and forwards. `api` — app API for claiming an address, sending, scheduling, API keys and account deletion. `public` — public REST API and remote MCP server. `maintenance` — cron every minute for send-later, snooze wake-ups, delivery status and trash purging |
| **Databases (TablesDB)** | `mailboxes`, `settings`, `messages`, `drafts`, `contacts`, `labels`, `apikeys`, with row-level permissions, a full-text search index and bulk row updates/deletes |
| **Storage** | `attachments` bucket (encrypted, antivirus, 25 MB) plus file tokens so inline `cid:` images and downloads work from plain URLs |
| **Messaging** | Outbound mail to external addresses, with Reply-To set to the sender's Appwrite Email address so replies come back in |
| **Realtime** | New mail, read/star/move changes, drafts, labels and settings sync instantly across tabs |
| **Avatars** | Sender photos (by email hash) and brand icons, QR codes for your address and the 2FA setup |
| **Sites** | Static TanStack Start SPA with prerendered landing and auth pages, served from `email.appwrite.network` |

## Features

Three-pane mail with conversation threading, unread/starred/attachment filters, full-text search, multi-select and drag-to-folder/label, snooze, send later, undo send, drafts with autosave, rich-text compose with attachments (drag, drop and paste), reply/reply-all/forward with quoting, sandboxed HTML rendering with remote-image blocking and quoted-text folding, Quick Look previews, labels, server-side rules, blocked senders, vacation replies, auto-forwarding, contacts with history, a ⌘K command palette, Gmail-style keyboard shortcuts, desktop notifications, light/dark/auto themes with macOS accent colors, and a mobile layout.

## Address format

Appwrite routes any local part at `<FUNCTION_ID>-<PROJECT_ID>.appwrite.email` to that function, so every user gets `<handle>@inbox-6ae21f6271db427f12bc.appwrite.email`, and `<handle>+anything@…` reaches the same mailbox. The earlier `<handle>+inbox@<PROJECT_ID>.appwrite.email` form is still routed and still delivers. For bare `<handle>@yourdomain.com` addresses, connect a custom email domain to the `inbox` function and add it to the function's `CUSTOM_DOMAINS` variable.

## Admin and sign-ups

The first person to claim an address on a fresh install becomes the admin, and sign-ups close. Admins get an **Admin** page in the sidebar to:

- turn **Allow new sign-ups** on or off,
- create accounts (a sign-in plus an address), even while sign-ups are closed,
- rename accounts, reset passwords, sign people out everywhere, block or unblock them, make or remove admins, and delete accounts with all their data.

**Sending limits.** Admins also set rate limits for outgoing mail: emails per minute, hour and day, and recipients per message (defaults 20, 200, 1,000 and 50; 0 means unlimited), with an option to exempt admins. Every recipient counts once, across the app, scheduled mail, the REST API and MCP. Sends are logged in the server-only `sendlog` table, so deleting sent mail doesn't reset the count, and a send over the limit is refused with HTTP 429, a `Retry-After` header on the REST API, and a message saying when to try again. The maintenance job purges log rows older than two days.

Closed sign-ups are enforced by Appwrite itself: the `api` function sets the project's user limit (`project.updateUserLimitPolicy`) to the current number of users, so public sign-up is rejected while server-side account creation by admins still works, and it re-syncs the limit whenever an account is added or deleted. Claiming an address is also refused while sign-ups are closed. Admins are users with the `admin` label; the state lives in the `config` table. For an install that already had users, promote someone with:

```bash
node scripts/make-admin.mjs you@example.com --close-signups
```

## API and MCP

The `public` function serves a REST API and a remote MCP server (Streamable HTTP) at `https://email-api.appwrite.network`. Docs live at [/developers](https://email.appwrite.network/developers), and the OpenAPI spec at `/openapi.json`.

- **MCP:** add `https://email-api.appwrite.network/mcp` to Claude, ChatGPT, Cursor or VS Code. The server answers unauthenticated calls with a `WWW-Authenticate` challenge pointing to its protected resource metadata, the client registers itself with the project's OAuth2 server (dynamic client registration), and the user signs in and approves scopes on the app's consent screen at `/oauth/consent`. Tools: `get_mailbox`, `list_messages`, `read_message`, `read_thread`, `list_labels`, `send_email`, `reply_to_email`, `update_messages`.
- **REST:** `GET /v1/me`, `GET /v1/messages`, `GET /v1/messages/{id}`, `GET /v1/threads/{id}`, `GET /v1/labels`, `POST /v1/messages`, `PATCH /v1/messages[/{id}]`, `DELETE /v1/messages/{id}`.
- **Auth:** OAuth 2.1 access tokens from the Appwrite project (RS256 JWTs verified against its JWKS, audience checked), or personal API keys (`mk_…`) created in Settings and stored as SHA-256 hashes.
- **Scopes:** `mail.read`, `mail.send`, `mail.modify`.

To enable the OAuth2 server on your own project, set the authorization URL to `https://<your-site>/oauth/consent` and allow the scopes `openid profile email offline_access mail.read mail.send mail.modify` (Auth → OAuth2 server, or `project.updateOAuth2Server`).

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
