import {
  Archive,
  CalendarClock,
  Clock,
  FileText,
  Inbox,
  Mails,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Folder } from './appwrite';

export const FOLDERS: { id: Folder; label: string; icon: LucideIcon; count?: 'inbox' | 'drafts' | 'scheduled' | 'snoozed' | 'spam' }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, count: 'inbox' },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'snoozed', label: 'Snoozed', icon: Clock, count: 'snoozed' },
  { id: 'drafts', label: 'Drafts', icon: FileText, count: 'drafts' },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'scheduled', label: 'Scheduled', icon: CalendarClock, count: 'scheduled' },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'all', label: 'All Mail', icon: Mails },
  { id: 'spam', label: 'Junk', icon: ShieldAlert, count: 'spam' },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

export const FOLDER_LABELS: Record<string, string> = Object.fromEntries(FOLDERS.map((f) => [f.id, f.label]));
FOLDER_LABELS.label = 'Label';

export function folderIcon(id: string): LucideIcon {
  return FOLDERS.find((f) => f.id === id)?.icon || Tag;
}

export const LABEL_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#8e8e93'];

export const VALID_FOLDERS = new Set(FOLDERS.map((f) => f.id as string).concat('label'));
