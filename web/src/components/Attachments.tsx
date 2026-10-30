import { AnimatePresence, motion } from 'motion/react';
import { Copy, Download, Eye, ExternalLink, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fileUrl, filePreviewUrl, type Attachment } from '~/lib/appwrite';
import { bytes, fileIcon } from '~/lib/format';
import { copyText } from '~/lib/actions';
import { openContextMenu } from './ContextMenu';
import { cx } from './ui';

const ICONS = {
  image: FileImage,
  pdf: FileText,
  archive: FileArchive,
  sheet: FileSpreadsheet,
  slides: Presentation,
  video: FileVideo,
  audio: FileAudio,
  doc: FileText,
  file: File,
};


export function AttachmentIcon({ a, className }: { a: { type: string; name: string }; className?: string }) {
  const kind = fileIcon(a.type, a.name);
  const Icon = ICONS[kind as keyof typeof ICONS];
  return <Icon className={className} style={{ color: kind === 'pdf' ? 'var(--accent)' : 'var(--fg-2)' }} />;
}

export function Attachments({ items }: { items: Attachment[] }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!items.length) return null;
  const total = items.reduce((n, a) => n + (a.size || 0), 0);
  return (
    <div className="mt-6">
      <div className="mb-2.5 text-[12.5px] font-medium text-fg-3">
        {items.length} {items.length === 1 ? 'attachment' : 'attachments'} · {bytes(total)}
      </div>
      <div className="flex flex-wrap gap-3">
        {items.map((a) => {
          const kind = fileIcon(a.type, a.name);
          const previewable = (kind === 'image' && !/svg|heic/.test(a.type)) || kind === 'pdf';
          return (
            <div
              key={a.id}
              className="group relative w-[180px]"
              onContextMenu={(e) =>
                openContextMenu(e, [
                  { heading: a.name },
                  previewable && { label: 'Quick Look', icon: <Eye />, onSelect: () => setPreview(a) },
                  { label: 'Open in New Tab', icon: <ExternalLink />, onSelect: () => window.open(fileUrl(a), '_blank') },
                  {
                    label: 'Download',
                    icon: <Download />,
                    onSelect: () => {
                      const link = document.createElement('a');
                      link.href = fileUrl(a, 'download');
                      link.download = a.name;
                      link.click();
                    },
                  },
                  { separator: true },
                  { label: 'Copy Link', icon: <Copy />, onSelect: () => copyText(fileUrl(a), 'Link copied') },
                ])
              }
            >
              <button className="block w-full text-left" onClick={() => (previewable ? setPreview(a) : window.open(fileUrl(a), '_blank'))}>
                <div className="flex h-[120px] items-center justify-center overflow-hidden rounded-2xl bg-fill transition-[transform,box-shadow] duration-200 ease-apple group-hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] group-active:scale-[0.98]">
                  {kind === 'image' && !/svg|heic/.test(a.type) ? (
                    <img src={filePreviewUrl(a, 336, 192)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <AttachmentIcon a={a} className="h-9 w-9" />
                  )}
                </div>
                <div className="px-1 pt-2">
                  <div className="truncate text-[13px] font-medium">{a.name}</div>
                  <div className="text-[11.5px] text-fg-3">{bytes(a.size)}</div>
                </div>
              </button>
              <a
                href={fileUrl(a, 'download')}
                download={a.name}
                title="Download"
                className="vibrancy absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] text-fg-2 opacity-0 shadow-sm transition hover:text-fg group-hover:opacity-100"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
      <QuickLook item={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function QuickLook({ item, onClose }: { item: Attachment | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-[95] flex flex-col bg-black/80 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="flex h-14 shrink-0 items-center gap-3 px-4 text-white" onClick={(e) => e.stopPropagation()}>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 hover:bg-white/20" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{item.name}</div>
              <div className="text-[12px] text-white/60">{bytes(item.size)}</div>
            </div>
            <a href={fileUrl(item)} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-md border border-white/15 px-3 text-[13px] hover:bg-white/10">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
            <a href={fileUrl(item, 'download')} download={item.name} className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0"
            onClick={(e) => e.stopPropagation()}
          >
            {fileIcon(item.type, item.name) === 'pdf' ? (
              <iframe title={item.name} src={fileUrl(item)} className={cx('h-full w-full max-w-4xl rounded-xl bg-white')} />
            ) : (
              <img src={fileUrl(item)} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
