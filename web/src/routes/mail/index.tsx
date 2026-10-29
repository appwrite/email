import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/mail/')({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: '/mail/$folder', params: { folder: 'inbox' } });
  },
});
