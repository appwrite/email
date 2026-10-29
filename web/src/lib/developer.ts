// Public API and MCP endpoints, plus one-click install links for MCP clients.
export const API_URL: string = (import.meta.env.VITE_PUBLIC_API_URL || 'https://email-api.appwrite.network').replace(/\/+$/, '');
export const MCP_URL = `${API_URL}/mcp`;
export const OPENAPI_URL = `${API_URL}/openapi.json`;
export const MCP_NAME = 'mail';

export const API_SCOPES = [
  ['mail.read', 'Read messages, threads and labels'],
  ['mail.send', 'Send email and replies'],
  ['mail.modify', 'Mark, star, label, move and delete'],
] as const;

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export const INSTALL = {
  cursor: `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_NAME}&config=${encodeURIComponent(b64(JSON.stringify({ url: MCP_URL })))}`,
  vscode: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: MCP_NAME, type: 'http', url: MCP_URL }))}`,
  claudeCode: `claude mcp add --transport http ${MCP_NAME} ${MCP_URL}`,
};
