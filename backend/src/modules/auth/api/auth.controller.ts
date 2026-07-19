import type { Request, Response } from 'express';
import { authService, type AuthCtx } from '../application/auth.service';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import type { RegisterDto, LoginDto, RefreshDto } from '../dto/auth.schemas';

function ctxOf(req: Request): AuthCtx {
  return { userAgent: req.header('user-agent') ?? undefined, ip: req.ip };
}

/** Thin HTTP adapter: parse request → call service → format response. */
export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body as RegisterDto, ctxOf(req));
    sendCreated(res, result);
  }

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body as LoginDto, ctxOf(req));
    sendSuccess(res, result);
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as RefreshDto;
    const tokens = await authService.refresh(refreshToken);
    sendSuccess(res, tokens);
  }

  async logout(req: Request, res: Response): Promise<void> {
    if (req.principal) await authService.logout(req.principal.sessionId);
    sendSuccess(res, { loggedOut: true });
  }

  async requestOtp(req: Request, res: Response): Promise<void> {
    const result = await authService.requestEmailOtp((req.body as { email: string }).email);
    sendSuccess(res, result);
  }

  async verifyOtp(req: Request, res: Response): Promise<void> {
    const { email, code } = req.body as { email: string; code: string };
    const result = await authService.verifyEmailOtp(email, code, ctxOf(req));
    sendSuccess(res, result);
  }

  async requestPhoneOtp(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await authService.requestPhoneOtp((req.body as { phone: string }).phone));
  }

  async verifyPhoneOtp(req: Request, res: Response): Promise<void> {
    const { phone, code } = req.body as { phone: string; code: string };
    sendSuccess(res, await authService.verifyPhoneOtp(phone, code, ctxOf(req)));
  }

  async googleLogin(req: Request, res: Response): Promise<void> {
    const result = await authService.loginWithGoogle((req.body as { idToken: string }).idToken, ctxOf(req));
    sendSuccess(res, result);
  }

  async sessions(req: Request, res: Response): Promise<void> {
    const list = await authService.listSessions(req.principal!.userId, req.principal!.sessionId);
    sendSuccess(res, list);
  }

  async revokeSession(req: Request, res: Response): Promise<void> {
    await authService.revokeSession(req.principal!.userId, req.params.id);
    sendSuccess(res, { revoked: true });
  }

  async logoutOthers(req: Request, res: Response): Promise<void> {
    await authService.logoutOthers(req.principal!.userId, req.principal!.sessionId);
    sendSuccess(res, { loggedOutOthers: true });
  }
}

export const authController = new AuthController();
