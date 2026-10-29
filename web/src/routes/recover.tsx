import { Link, createFileRoute } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthLayout, FormError } from '~/components/AuthLayout';
import { Button, Field, Input } from '~/components/ui';
import { account } from '~/lib/appwrite';

export const Route = createFileRoute('/recover')({
  head: () => ({ meta: [{ title: 'Reset password — Mail' }] }),
  component: Recover,
});

function Recover() {
  const [params, setParams] = useState<{ userId?: string; secret?: string }>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Read the link parameters on the client; this page is prerendered.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    setParams({ userId: sp.get('userId') || undefined, secret: sp.get('secret') || undefined });
  }, []);

  const resetting = !!(params.userId && params.secret);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (resetting) {
        await account.updateRecovery({ userId: params.userId!, secret: params.secret!, password });
      } else {
        await account.createRecovery({ email, url: `${location.origin}/recover` });
      }
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title={resetting ? 'Password updated' : 'Check your email'}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <p className="text-[15px] text-fg-2">
            {resetting ? 'You can now sign in with your new password.' : `If an account exists for ${email}, a reset link is on its way.`}
          </p>
          <Link to="/login" className="mt-5 inline-flex h-10 items-center rounded-md bg-accent px-6 text-[14px] font-medium text-white transition hover:opacity-90">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={resetting ? 'Choose a new password' : 'Reset your password'}
      subtitle={resetting ? undefined : 'We’ll email you a secure link.'}
      footer={
        <Link to="/login" className="font-medium text-accent">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError>{error}</FormError>
        {resetting ? (
          <Field label="New password" hint="At least 8 characters.">
            <Input type="password" autoComplete="new-password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        ) : (
          <Field label="Email">
            <Input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          {resetting ? 'Update password' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
}
