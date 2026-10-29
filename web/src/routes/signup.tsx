import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { ID } from 'appwrite';
import { useState, type FormEvent } from 'react';
import { AuthLayout, FormError } from '~/components/AuthLayout';
import { Button, Field, Input } from '~/components/ui';
import { account } from '~/lib/appwrite';
import { queryClient } from '~/lib/queries';
import { forgetDevice } from '~/lib/session';

export const Route = createFileRoute('/signup')({
  head: () => ({ meta: [{ title: 'Create your address — Mail' }] }),
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await account.deleteSession({ sessionId: 'current' }).catch(() => {});
      await account.create({ userId: ID.unique(), email, password, name });
      await account.createEmailPasswordSession({ email, password });
      account.createVerification({ url: `${location.origin}/verify` }).catch(() => {});
      forgetDevice();
      queryClient.setQueryData(['account'], await account.get());
      navigate({ to: '/welcome' });
    } catch (e: any) {
      setError(e.message || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Get your address"
      subtitle="Free, fast and private. Ready in under a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError>{error}</FormError>
        <Field label="Full name">
          <Input autoComplete="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
        </Field>
        <Field label="Current email" hint="For sign-in and password recovery. Your new address comes next.">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
