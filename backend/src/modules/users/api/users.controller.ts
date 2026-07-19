import type { Request, Response } from 'express';
import { userRepository } from '../infrastructure/user.repository';
import { sendSuccess } from '../../../shared/http/api-response';
import { NotFoundError } from '../../../core/errors/app-error';

export class UsersController {
  async me(req: Request, res: Response): Promise<void> {
    const user = await userRepository.findById(req.principal!.userId);
    if (!user) throw new NotFoundError('User');
    sendSuccess(res, {
      id: user._id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      dateOfBirth: user.dateOfBirth,
      addresses: user.addresses ?? [],
      emergencyContacts: user.emergencyContacts ?? [],
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      roles: user.roles,
      status: user.status,
    });
  }
}

export const usersController = new UsersController();
