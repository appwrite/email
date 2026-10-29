import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { NotFound } from './components/NotFound';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // The SPA shell boots with /mail pending; don't hold that frame for the
    // default 500ms minimum once the app is ready to render.
    defaultPendingMinMs: 0,
    defaultNotFoundComponent: NotFound,
  });
}
