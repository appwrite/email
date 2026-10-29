import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { AuthenticationFactor, ID } from 'appwrite';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthLayout, FormError } from '~/components/AuthLayout';
import { Button, Field, Input, Segmented } from '~/components/ui';
import { account } from '~/lib/appwrite';
import { fetchAccount, queryClient } from '~/lib/queries';
import { forgetDevice } from '~/lib/session';

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Sign in — Mail' }] }),
  component: Login,
});

type Step = 'credentials' | 'code' | 'mfa';

function Login() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [tokenUserId, setTokenUserId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccount().then((user) => {
      if (user) navigate({ to: '/mail/$folder', params: { folder: 'inbox' }, replace: true });
    });
  }, [navigate]);

  async function finish() {
    try {
      const user = await account.get();
      // Start clean: nothing cached under an earlier session may be shown.
      forgetDevice();
      queryClient.setQueryData(['account'], user);
      navigate({ to: '/mail/$folder', params: { folder: 'inbox' } });
    } catch (e: any) {
      if (e.type === 'user_more_factors_required') {
        const challenge = await account.createMfaChallenge({ factor: AuthenticationFactor.Totp });
        setChallengeId(challenge.$id);
        setCode('');
        setStep('mfa');
        return;
      }
      throw e;
    }
  }

  async function run(fn: () => Promise<void>) {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const submitCredentials = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await account.deleteSession({ sessionId: 'current' }).catch(() => {});
      if (method === 'password') {
        await account.createEmailPasswordSession({ email, password });
        await finish();
      } else {
        const token = await account.createEmailToken({ userId: ID.unique(), email });
        setTokenUserId(token.userId);
        setCode('');
        setStep('code');
      }
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (step === 'code') {
        await account.createSession({ userId: tokenUserId, secret: code.trim() });
      } else {
        await account.updateMfaChallenge({ challengeId, otp: code.trim() });
      }
      await finish();
    });
  };

  if (step !== 'credentials') {
    return (
      <AuthLayout
        title={step === 'mfa' ? 'Two-factor authentication' : 'Check your email'}
        subtitle={
          step === 'mfa' ? 'Enter the 6-digit code from your authenticator app.' : (
            <>
              We sent a 6-digit code to <span className="font-medium text-fg">{email}</span>.
            </>
          )
        }
      >
        <form onSubmit={submitCode}>
          <FormError>{error}</FormError>
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="h-14 text-center font-mono text-[26px] tracking-[0.4em]"
          />
          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={loading} disabled={code.length < 6}>
            Continue
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('credentials');
              setError('');
            }}
            className="mx-auto mt-4 flex items-center gap-1 text-[14px] text-fg-2 hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to your inbox."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-accent">
            Create your address
          </Link>
        </>
      }
    >
      <form onSubmit={submitCredentials} className="space-y-4">
        <Segmented
          className="flex w-full [&>button]:flex-1"
          value={method}
          onChange={(v) => {
            setMethod(v);
            setError('');
          }}
          options={[
            { value: 'password', label: <span className="inline-flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Password</span> },
            { value: 'code', label: <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email code</span> },
          ]}
        />
        <FormError>{error}</FormError>
        <Field label="Email">
          <Input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        {method === 'password' && (
          <Field
            label="Password"
            hint={
              <Link to="/recover" className="text-accent">
                Forgot password?
              </Link>
            }
          >
            <Input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          {method === 'password' ? 'Sign in' : 'Email me a code'}
        </Button>
      </form>
    </AuthLayout>
  );
}
