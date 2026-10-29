import { Channel, type Models } from 'appwrite';
import { createContext, useContext, useEffect } from 'react';
import { DATABASE_ID, TABLES, realtime, type MailboxRow, type MessageRow } from './appwrite';
import { queryClient, removeRowFromCaches, upsertRowInCaches } from './queries';
import { prefsStore, toast } from './store';
import { displayName } from './format';

export type MailContextValue = {
  user: Models.User<Models.Preferences>;
  mailbox: MailboxRow;
};

export const MailContext = createContext<MailContextValue | null>(null);

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error('useMail must be used inside the mail layout');
  return ctx;
}

let audioCtx: AudioContext | null = null;

// A soft two-note chime, synthesised so there is no asset to download.
export function playChime() {
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.08, t + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.5);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.55);
    });
  } catch {
    // audio is optional
  }
}

function notifyNewMail(row: MessageRow, open: (row: MessageRow) => void) {
  const from = displayName({ name: row.fromName, email: row.fromEmail });
  const prefs = prefsStore.get();
  if (prefs.sound) playChime();
  toast({
    title: from,
    description: row.subject || '(no subject)',
    action: { label: 'Open', onClick: () => open(row) },
    duration: 6000,
  });
  if (prefs.notifications && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(from, { body: row.subject || row.snippet, icon: '/favicon.svg', tag: row.$id });
    n.onclick = () => {
      window.focus();
      open(row);
    };
  }
}

/**
 * Keeps every cached view in sync with the database over Appwrite Realtime:
 * new mail appears the moment the inbox function stores it.
 */
export function useMailRealtime(uid: string | undefined, open: (row: MessageRow) => void) {
  useEffect(() => {
    if (!uid) return;
    let unsubscribe: (() => Promise<void>) | null = null;
    let cancelled = false;
    let countsTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshCounts = () => {
      clearTimeout(countsTimer);
      countsTimer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['counts'] }), 250);
    };

    const db = Channel.tablesdb(DATABASE_ID);
    realtime()
      .subscribe(
        [
          db.table(TABLES.messages).row(),
          db.table(TABLES.drafts).row(),
          db.table(TABLES.labels).row(),
          db.table(TABLES.contacts).row(),
          db.table(TABLES.settings).row(),
        ],
        (event) => {
          const row = event.payload as Models.Row & Record<string, any>;
          const kind = event.events.find((e) => /\.(create|update|delete|upsert)$/.test(e))?.split('.').pop();
          switch (row.$tableId) {
            case TABLES.messages: {
              if (kind === 'delete') removeRowFromCaches(row.$id);
              else upsertRowInCaches(row as MessageRow, { insert: true });
              if (kind === 'create' && row.folder === 'inbox' && row.status === 'received') notifyNewMail(row as MessageRow, open);
              refreshCounts();
              break;
            }
            case TABLES.drafts:
              queryClient.invalidateQueries({ queryKey: ['drafts'] });
              refreshCounts();
              break;
            case TABLES.labels:
              queryClient.invalidateQueries({ queryKey: ['labels'] });
              break;
            case TABLES.contacts:
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
              break;
            case TABLES.settings:
              queryClient.setQueryData(['settings', uid], row);
              break;
          }
        },
      )
      .then((sub) => {
        if (cancelled) sub.unsubscribe();
        else unsubscribe = sub.unsubscribe;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(countsTimer);
      unsubscribe?.();
    };
  }, [uid, open]);
}
