import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 3000 is often taken by other local projects; PORT overrides.
  server: { port: Number(process.env.PORT) || 3100, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Static SPA: the mail app renders client-side, while the marketing and
      // auth pages are prerendered so they paint instantly from the CDN.
      spa: { enabled: true, maskPath: '/mail' },
      // One bundle loaded in parallel beats a waterfall of per-route and
      // per-icon chunks: every screen is ready the moment the app boots.
      router: { codeSplittingOptions: { defaultBehavior: [] } },
      prerender: { enabled: true, crawlLinks: false, autoStaticPathsDiscovery: false },
      pages: [{ path: '/' }, { path: '/login' }, { path: '/signup' }, { path: '/recover' }],
    }),
    viteReact(),
  ],
});
