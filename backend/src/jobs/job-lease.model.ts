import { Schema, model } from 'mongoose';

/** A short lease so only one API instance runs a fallback job per interval. */
interface JobLeaseDoc {
  _id: string;
  until: Date;
}

const schema = new Schema<JobLeaseDoc>({ _id: { type: String, required: true }, until: { type: Date, required: true } }, { versionKey: false, _id: false });

const JobLeaseModel = model<JobLeaseDoc>('JobLease', schema);

/** True when this caller now holds the lease for `name`; false when another instance does. */
export async function acquireJobLease(name: string, intervalMs: number): Promise<boolean> {
  try {
    await JobLeaseModel.findOneAndUpdate(
      { _id: name, until: { $lte: new Date() } },
      { $set: { until: new Date(Date.now() + Math.floor(intervalMs * 0.8)) } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false; // the lease is still held
    throw err;
  }
}
