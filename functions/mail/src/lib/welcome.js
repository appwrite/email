import { escapeHtml } from './content.js';

export const APP_NAME = 'Mail';
const BLUE = '#007aff';
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif";

// Neutral, Apple-style welcome message: system type, soft gray tiles, one blue accent.
export function welcomeEmail({ name, address }) {
  const first = escapeHtml((name || '').split(' ')[0] || 'there');
  const addr = escapeHtml(address);
  const tile = (label, body) => `
    <td style="width:50%;padding:6px;vertical-align:top">
      <div style="background:#f5f5f7;border-radius:16px;padding:18px">
        <div style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:6px">${label}</div>
        <div style="font-size:14px;color:#6e6e73;line-height:1.5">${body}</div>
      </div>
    </td>`;
  return {
    subject: `Welcome to ${APP_NAME}, ${first}`,
    html: `
<div style="max-width:600px;margin:0 auto;padding:40px 24px;font-family:${FONT};color:#1d1d1f">
  <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(180deg,#4fb3ff,#0a6cff);margin-bottom:28px"></div>
  <h1 style="font-size:34px;line-height:1.1;letter-spacing:-0.03em;font-weight:700;margin:0 0 14px">Your inbox is ready.</h1>
  <p style="font-size:17px;line-height:1.55;color:#6e6e73;margin:0 0 28px">Hi ${first}, this is your new address. Share it anywhere, and new mail will appear here the moment it arrives.</p>
  <div style="background:#f5f5f7;border-radius:14px;padding:16px 18px;font-size:16px;font-weight:600;color:${BLUE};word-break:break-all;margin-bottom:32px">${addr}</div>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 -6px">
    <tr>${tile('Instant', 'New mail appears in every open window, with no refresh.')}${tile('Attachments', 'Preview photos and documents inline, then download in one click.')}</tr>
    <tr>${tile('Rules and labels', 'Sort, label, star and archive mail automatically as it arrives.')}${tile('Send later', 'Schedule messages, snooze threads and set a vacation reply.')}</tr>
  </table>
  <p style="font-size:14px;color:#6e6e73;margin:32px 0 0">Press <b style="color:#1d1d1f">⌘K</b> anywhere for commands, <b style="color:#1d1d1f">C</b> to compose and <b style="color:#1d1d1f">/</b> to search.</p>
  <div style="border-top:1px solid #e8e8ed;margin-top:36px;padding-top:18px;font-size:12px;color:#a1a1a6">Sent by ${APP_NAME}. You’re receiving this because you created an account.</div>
</div>`,
  };
}
