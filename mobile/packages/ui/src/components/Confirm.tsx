import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { space } from '../theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Input } from './Input';
import { Text } from './Text';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  /** Ask for a reason; with `required` the confirm button waits for one. */
  reason?: { label: string; placeholder?: string; required?: boolean };
  /** The person must type this word to confirm a dangerous action. */
  requireText?: string;
}

type Result = { ok: boolean; reason: string };

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<Result>>(async () => ({ ok: false, reason: '' }));

/** The website's confirm dialog as a bottom sheet: `const { ok, reason } = await confirm({...})`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const resolver = useRef<((r: Result) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setReason('');
    setTyped('');
    setOpts(o);
    return new Promise<Result>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.({ ok, reason: reason.trim() });
    resolver.current = null;
    setOpts(null);
  };

  const needsReason = (!!opts?.reason?.required && !reason.trim()) || (!!opts?.requireText && typed.trim() !== opts.requireText);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <BottomSheet
        visible={!!opts}
        onClose={() => close(false)}
        title={opts?.title}
        footer={
          <View style={{ gap: space.sm }}>
            <Button title={opts?.confirmLabel ?? 'Confirm'} variant={opts?.tone === 'destructive' ? 'destructive' : 'primary'} disabled={needsReason} onPress={() => close(true)} />
            <Button title={opts?.cancelLabel ?? 'Not now'} variant="ghost" onPress={() => close(false)} />
          </View>
        }
      >
        {typeof opts?.description === 'string' ? <Text tone="muted">{opts.description}</Text> : opts?.description}
        {opts?.requireText ? <Input label={`Type ${opts.requireText} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="characters" /> : null}
        {opts?.reason ? <Input label={opts.reason.label} placeholder={opts.reason.placeholder} value={reason} onChangeText={setReason} multiline /> : null}
      </BottomSheet>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
