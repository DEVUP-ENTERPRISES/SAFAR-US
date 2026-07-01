/* Dev utility: grant super_admin to a user by email. Usage: ts-node scripts/make-admin.ts <email> */
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongoose.client';
import { UserModel } from '../src/modules/users/infrastructure/user.model';
import { ROLES } from '../src/shared/constants/rbac';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) throw new Error('email arg required');
  await connectMongo();
  const res = await UserModel.updateOne(
    { email: email.toLowerCase() },
    { $addToSet: { roles: ROLES.SUPER_ADMIN } },
  );
  // eslint-disable-next-line no-console
  console.log('updated:', res.modifiedCount, 'for', email);
  await disconnectMongo();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
