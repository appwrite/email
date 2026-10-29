import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import appCss from '../styles.css?url';
import { ENDPOINT } from '~/lib/appwrite';
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
          'A fast, private, beautifully simple email service. Get your address in seconds and read mail anywhere.',
      },
      { name: 'theme-color', content: '#ffffff' },
      { property: 'og:title', content: 'Mail' },
      { property: 'og:description', content: 'Email, beautifully simple.' },
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
