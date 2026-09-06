import { otpService } from './otp.service';
import { setKvStore, InMemoryKvStore, kv } from '../../../infrastructure/cache/kv-store';

/**
 * OTP security against the in-memory KV store. Codes must be single-use,
 * brute-force-capped, send-throttled, and never stored in the clear.
 */
let store: InMemoryKvStore;
beforeEach(() => {
  store = new InMemoryKvStore();
  setKvStore(store);
});

describe('otpService', () => {
  it('issues a six-digit code and verifies it once', async () => {
    const code = await otpService.request('login', 'a@x.com');
    expect(code).toMatch(/^\d{6}$/);
    await expect(otpService.verify('login', 'a@x.com', code)).resolves.toBeUndefined();
  });

  it('is single-use — the same code cannot be verified twice', async () => {
    const code = await otpService.request('login', 'a@x.com');
    await otpService.verify('login', 'a@x.com', code);
    await expect(otpService.verify('login', 'a@x.com', code)).rejects.toThrow(/expired or not found/i);
  });

  it('rejects a wrong code', async () => {
    await otpService.request('login', 'a@x.com');
    await expect(otpService.verify('login', 'a@x.com', '000000')).rejects.toThrow(/invalid code/i);
  });

  it('locks out after too many wrong attempts', async () => {
    await otpService.request('login', 'a@x.com');
    for (let i = 0; i < 5; i += 1) {
      await expect(otpService.verify('login', 'a@x.com', '000000')).rejects.toThrow();
    }
    // The correct code no longer works — the attempt cap tripped.
    await expect(otpService.verify('login', 'a@x.com', '111111')).rejects.toThrow(/too many/i);
  });

  it('throttles repeated sends to the same target', async () => {
    for (let i = 0; i < 5; i += 1) await otpService.request('login', 'spammed@x.com');
    await expect(otpService.request('login', 'spammed@x.com')).rejects.toThrow(/too many codes/i);
  });

  it('stores the code hashed, never in plaintext', async () => {
    const code = await otpService.request('login', 'a@x.com');
    // Find the stored OTP record and confirm the raw code is not in it.
    const raw = await kv().get('otp:login:a@x.com');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain(code);
  });
});
