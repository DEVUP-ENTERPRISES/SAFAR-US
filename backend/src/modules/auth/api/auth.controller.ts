import type { Request, Response } from 'express';
import { authService } from '../application/auth.service';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import type { RegisterDto, LoginDto, RefreshDto } from '../dto/auth.schemas';

/** Thin HTTP adapter: parse request → call service → format response. */
export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body as RegisterDto);
    sendCreated(res, result);
  }

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body as LoginDto);
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
}

export const authController = new AuthController();
