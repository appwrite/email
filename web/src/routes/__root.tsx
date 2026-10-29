import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import appCss from '../styles.css?url';
import { ENDPOINT } from '~/lib/appwrite';

// Absolute URL for link previews; set VITE_SITE_URL when self-hosting.
const SITE_URL: string = (import.meta.env.VITE_SITE_URL || 'https://email.appwrite.network').replace(/\/+$/, '');
import { queryClient } from '~/lib/queries';
import { THEME_BOOT_SCRIPT, initPrefs } from '~/lib/store';
import { Toaster } from '~/components/Toaster';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Mail — Open-source email you own' },
      {
        name: 'description',
        content:
          'A beautifully simple, open-source inbox with an API and MCP server. Runs on Appwrite Cloud or your own Appwrite.',
      },
      { name: 'theme-color', content: '#ffffff' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Mail' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:title', content: 'Mail — Open-source email you own' },
      { property: 'og:description', content: 'A beautifully simple, open-source inbox with an API and MCP server. Runs on Appwrite Cloud or your own Appwrite.' },
      { property: 'og:image', content: `${SITE_URL}/og.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Mail: email you actually own. Open source and self-hostable.' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Mail — Open-source email you own' },
      { name: 'twitter:description', content: 'A beautifully simple, open-source inbox with an API and MCP server.' },
      { name: 'twitter:image', content: `${SITE_URL}/og.png` },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'preconnect', href: new URL(ENDPOINT).origin, crossOrigin: 'anonymous' },
    ],
    scripts: [{ children: THEME_BOOT_SCRIPT }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    initPrefs();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
