'use client';

import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { saveFile } from '@/lib/utils/save-file';

/** One click to save a spreadsheet the server builds; opens in Excel, Google Sheets or Numbers. */
export function DownloadButton({ onClick, label = 'Download' }: { onClick: () => Promise<{ blob: Blob; filename?: string }>; label?: string }) {
  const toast = useToast();
  const run = useMutation({
    meta: { silentError: true },
    mutationFn: onClick,
    onSuccess: ({ blob, filename }) => saveFile(blob, filename ?? 'applications.csv'),
    onError: () => toast({ tone: 'error', title: 'The download didn’t work. Try again.' }),
  });
  return (
    <Button size="sm" variant="outline" loading={run.isPending} onClick={() => run.mutate()}>
      <Download className="h-4 w-4" aria-hidden /> {label}
    </Button>
  );
}
