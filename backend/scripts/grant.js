/* Plain-JS admin grant (no ts-node). Usage: node scripts/grant.js <email> [role] */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const email = process.argv[2];
  const role = process.argv[3] || 'super_admin';
  if (!email) throw new Error('email arg required');
  await mongoose.connect(process.env.MONGO_URI);
  const r = await mongoose.connection
    .collection('users')
    .updateOne({ email: email.toLowerCase() }, { $addToSet: { roles: role } });
  console.log('matched', r.matchedCount, 'modified', r.modifiedCount, '->', email, role);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
