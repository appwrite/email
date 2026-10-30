import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBrand } from '~/lib/brand';
import { AppwriteLogotype, EmailLockup } from './brand';

export function SoftLights({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className || ''}`} aria-hidden>
      <div className="soft-light-pink absolute -left-[42%] bottom-[-32%] h-[560px] w-[980px] lg:-left-[36%] lg:h-[640px] lg:w-[1120px]" />
      <div className="soft-light-purple absolute -right-[44%] bottom-[-34%] h-[580px] w-[1000px] lg:-right-[38%] lg:h-[660px] lg:w-[1140px]" />
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const brand = useBrand();
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-bg">
      <SoftLights />
      <header className="flex h-16 items-center px-5 sm:px-8">
        <Link to="/" aria-label={`${brand.name} home`}>
          <EmailLockup size={20} />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[7vh]">
        <div className="w-full max-w-[400px]">
          <div className="mb-6">
            <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">{title}</h1>
            {subtitle && <p className="mt-2.5 text-[14px] leading-relaxed text-fg-2">{subtitle}</p>}
          </div>
          <div className="rounded-2xl bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_28px_-8px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.1)]">{children}</div>
          {footer && <div className="mt-5 text-[13px] text-fg-2">{footer}</div>}
        </div>
      </main>
      <footer className="flex items-center justify-between gap-4 px-5 py-6 text-[12px] text-fg-3 sm:px-8">
        <span>© {new Date().getFullYear()} {brand.name}</span>
        <a href="https://appwrite.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 transition hover:text-fg">
          Runs on <AppwriteLogotype className="h-[15px] text-fg-2" />
        </a>
      </footer>
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-4 rounded-md border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-danger">
      {children}
    </div>
  );
}
