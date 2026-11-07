'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type Notification } from './api';

const KEY = ['notifications'];

/** Marks notifications read at once on screen, and puts them back if the server refuses. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: KEY });
      const before = qc.getQueryData<Notification[]>(KEY);
      const now = new Date().toISOString();
      const wanted = new Set(ids);
      qc.setQueryData<Notification[]>(KEY, (list) => list?.map((n) => (wanted.has(n._id) && !n.readAt ? { ...n, readAt: now } : n)));
      return { before };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.before) qc.setQueryData(KEY, ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
