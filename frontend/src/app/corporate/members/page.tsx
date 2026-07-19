'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { corporateApi } from '@/features/corporate/api';

export default function MembersPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const members = useQuery({ queryKey: ['corp-members'], queryFn: () => corporateApi.members() });
  const [form, setForm] = useState({ email: '', role: 'employee' });
  const invite = useMutation({
    mutationFn: () => corporateApi.invite(form.email, form.role),
    onSuccess: () => { setForm({ email: '', role: 'employee' }); qc.invalidateQueries({ queryKey: ['corp-members'] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => corporateApi.removeMember(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['corp-members'] }) });

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Members</h1>
      <Card>
        <CardHeader><CardTitle>Invite a member</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Work email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@acme.com" /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="corp_admin">Admin</option>
            </select>
          </Field>
          <Button disabled={!form.email} loading={invite.isPending} onClick={() => invite.mutate()}>Invite</Button>
        </CardContent>
      </Card>

      {members.isLoading && <Skeleton className="h-40 w-full" />}
      {members.data && (
        <div className="space-y-2">
          {members.data.map((m) => (
            <Card key={m._id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{m.email}</p>
                  <p className="text-xs capitalize text-muted-foreground">{m.role.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={m.status === 'active' ? 'success' : 'warning'}>{m.status}</Badge>
                  {m.role !== 'corp_admin' && (
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => { const { ok } = await confirm({ title: `Remove ${m.email} from the organization?`, description: 'They lose access to corporate booking and cost centers immediately.', confirmLabel: 'Remove member', tone: 'destructive' }); if (ok) remove.mutate(m._id); }}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
