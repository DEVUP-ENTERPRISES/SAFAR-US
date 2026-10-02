import type { Request, Response } from 'express';
import type { Viewer } from '../../modules/media/application/timed-view.service';

/** The signed-in caller with what the audit log records about the request. */
export const viewerOf = (req: Request): Viewer => ({ userId: req.principal!.userId, roles: req.principal!.roles, ip: req.ip, userAgent: req.get('user-agent') });

/** Private files and their tokens must never be cached by a browser or proxy. */
export const noStore = (res: Response) => res.set({ 'Cache-Control': 'no-store, private, max-age=0', Pragma: 'no-cache' });
