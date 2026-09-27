import type { Request } from 'express';
import { requestFailureService } from './request-failure.service';
import { RequestFailureModel } from '../infrastructure/request-failure.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const req = (method: string, url: string, body: Record<string, unknown> = {}) =>
  ({ method, originalUrl: url, body, params: {}, header: () => undefined, principal: { userId: 'u1' }, res: { locals: {} } }) as unknown as Request;
const settle = () => new Promise((r) => setTimeout(r, 150));

describe('request failure log', () => {
  it('records a failed booking and every server error, but not routine refusals elsewhere', async () => {
    requestFailureService.record(req('POST', '/api/v1/bookings', { vehicleId: 'v1' }), 502, 'EXTERNAL_SERVICE_ERROR', 'Stripe createIntent failed');
    requestFailureService.record(req('POST', '/api/v1/bookings'), 409, 'NOT_AVAILABLE', 'Vehicle is not available');
    requestFailureService.record(req('GET', '/api/v1/vehicles/x'), 500, 'INTERNAL_ERROR', 'boom');
    requestFailureService.record(req('POST', '/api/v1/auth/login'), 401, 'UNAUTHORIZED', 'bad password');
    requestFailureService.record(req('POST', '/api/v1/reviews'), 422, 'VALIDATION_ERROR', 'x');
    await settle();
    const rows = await RequestFailureModel.find().lean();
    expect(rows.map((r) => r.code).sort()).toEqual(['EXTERNAL_SERVICE_ERROR', 'INTERNAL_ERROR', 'NOT_AVAILABLE']);
    expect(rows.find((r) => r.code === 'EXTERNAL_SERVICE_ERROR')).toMatchObject({ area: 'booking', vehicleId: 'v1', userId: 'u1' });

    const { summary } = await requestFailureService.list({ days: 1 });
    expect(summary.find((s) => s.code === 'NOT_AVAILABLE')?.count).toBe(1);
  });
});
