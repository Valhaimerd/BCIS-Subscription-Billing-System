import { expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '@bcis/database';
import { MasterDataService } from './master-data.js';

it('stores the plan price change reason in audit history, not in plan columns', async () => {
  const plan = {
    id: '00000000-0000-4000-8000-000000000010',
    serviceTypeId: '00000000-0000-4000-8000-000000000020',
    code: 'NET-25',
    name: 'Internet 25',
    priceCentavos: 85000,
    speedMbps: 25,
    channelCount: null,
    description: null,
    isActive: true,
  };
  const whereSelect = vi.fn(async () => [{ plan, typeCode: 'INTERNET' }]);
  const returning = vi.fn(async () => [plan]);
  const updateSet = vi.fn(() => ({
    where: vi.fn(() => ({ returning })),
  }));
  const auditValues = vi.fn(async () => undefined);
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where: whereSelect })),
      })),
    })),
    update: vi.fn(() => ({ set: updateSet })),
    insert: vi.fn(() => ({ values: auditValues })),
  } as unknown as DatabaseConnection['db'];

  const service = new MasterDataService(db);
  await service.updatePlan(
    plan.id,
    { priceCentavos: 85000, reason: 'Approved annual rate review' },
    '00000000-0000-4000-8000-000000000001',
  );

  expect(updateSet).toHaveBeenCalledWith({
    priceCentavos: 85000,
    updatedAt: expect.any(Date),
  });
  expect(auditValues).toHaveBeenCalledWith({
    actorUserId: '00000000-0000-4000-8000-000000000001',
    action: 'PLAN_UPDATED',
    entityType: 'service_plan',
    entityId: plan.id,
    newValues: { priceCentavos: 85000 },
    reason: 'Approved annual rate review',
  });
});
