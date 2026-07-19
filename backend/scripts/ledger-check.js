const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const L = mongoose.connection.collection('ledgerentries');
  const agg = await L.aggregate([{ $group: { _id: '$direction', total: { $sum: '$amount' } } }]).toArray();
  console.log('global by direction:', agg);
  const perTxn = await L.aggregate([
    { $group: { _id: { t: '$txnId', d: '$direction' }, s: { $sum: '$amount' } } },
    { $group: { _id: '$_id.t', legs: { $push: { d: '$_id.d', s: '$s' } } } },
  ]).toArray();
  let unbalanced = 0;
  for (const t of perTxn) {
    const c = (t.legs.find((x) => x.d === 'credit') || {}).s || 0;
    const d = (t.legs.find((x) => x.d === 'debit') || {}).s || 0;
    if (c !== d) { unbalanced++; console.log('UNBALANCED', t._id, 'credit', c, 'debit', d); }
  }
  console.log('transactions checked:', perTxn.length, 'unbalanced:', unbalanced);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
