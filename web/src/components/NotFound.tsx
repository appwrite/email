import { Link } from '@tanstack/react-router';
import { SoftLights } from './AuthLayout';
import { EmailMark } from './brand';

export function NotFound() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 text-center text-fg">
      <SoftLights />
      <EmailMark size={64} className="mb-6" />
      <p className="eyebrow mb-2">Error 404</p>
      <h1 className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em]">Lost in transit</h1>
      <p className="mt-4 max-w-sm text-[15px] text-fg-2">This page bounced. Head back to your inbox.</p>
      <Link
        to="/mail/$folder"
        params={{ folder: 'inbox' }}
        className="mt-8 inline-flex h-10 items-center rounded-full bg-accent px-6 text-[14px] font-medium text-white transition hover:opacity-90"
      >
        Open inbox
      </Link>
    </div>
  );
}
