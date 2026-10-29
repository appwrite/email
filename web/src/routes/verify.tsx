import { Link, createFileRoute } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthLayout } from '~/components/AuthLayout';
import { Spinner } from '~/components/ui';
import { account } from '~/lib/appwrite';
import { queryClient } from '~/lib/queries';

export const Route = createFileRoute('/verify')({
  ssr: false,
  component: Verify,
});

function Verify() {
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const userId = sp.get('userId');
    const secret = sp.get('secret');
    if (!userId || !secret) {
      setState('error');
      setMessage('This verification link is incomplete.');
      return;
    }
    account
      .updateVerification({ userId, secret })
      .then(() => {
        setState('done');
        queryClient.invalidateQueries({ queryKey: ['account'] });
      })
      .catch((e) => {
        setState('error');
        setMessage(e.message);
      });
  }, []);

  return (
    <AuthLayout title={state === 'done' ? 'Email verified' : state === 'error' ? 'Verification failed' : 'Verifying'}>
      <div className="text-center">
        {state === 'working' && <Spinner size={28} className="mx-auto text-fg-3" />}
        {state === 'done' && <CheckCircle2 className="mx-auto h-10 w-10 text-success" />}
        {state === 'error' && <AlertCircle className="mx-auto h-10 w-10 text-danger" />}
        {message && <p className="mt-3 text-[15px] text-fg-2">{message}</p>}
        {state !== 'working' && (
          <Link to="/mail/$folder" params={{ folder: 'inbox' }} className="mt-5 inline-flex h-10 items-center rounded-md bg-accent px-6 text-[14px] font-medium text-white transition hover:opacity-90">
            Open Inbox
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
