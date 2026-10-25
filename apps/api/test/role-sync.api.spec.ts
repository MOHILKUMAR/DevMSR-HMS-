import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyRoleSync, planRoleSync } from '../src/auth/role-sync.js';
import { createHospital, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// `pnpm db:sync-roles` is how a permission matrix change reaches a live hospital.
describe('role sync', () => {
  let t: TestApp;
  let hospital: TestHospital;

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  const ownDifferences = async () => (await planRoleSync(t.prisma)).roles.filter((role) => role.hospitalId === hospital.id);

  it('finds nothing to change for a hospital whose roles match the matrix', async () => {
    expect(await ownDifferences()).toEqual([]);
  });

  it('restores a missing grant, removes an extra one, and audits the change, as the API role', async () => {
    const cashier = hospital.roleIds.get('cashier');
    const billingClerk = hospital.roleIds.get('billing_clerk');
    if (cashier === undefined || billingClerk === undefined) throw new Error('roles missing');
    const receipt = await t.prisma.permission.findUniqueOrThrow({ where: { code: 'payments.receipt.create' } });
    await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: cashier, permissionId: receipt.id } } });
    await t.prisma.rolePermission.create({ data: { roleId: billingClerk, permissionId: receipt.id } });
    const custom = await t.prisma.role.create({ data: { hospitalId: hospital.id, code: 'custom_desk', name: 'Custom desk' } });
    await t.prisma.rolePermission.create({ data: { roleId: custom.id, permissionId: receipt.id } });

    expect(await ownDifferences()).toEqual([
      expect.objectContaining({ roleCode: 'billing_clerk', roleId: billingClerk, added: [], removed: ['payments.receipt.create'] }),
      expect.objectContaining({ roleCode: 'cashier', roleId: cashier, added: ['payments.receipt.create'], removed: [] }),
    ]);

    await t.prisma.$transaction((tx) => applyRoleSync(tx));

    expect(await ownDifferences()).toEqual([]);
    const events = await t.prisma.auditEvent.findMany({
      where: { hospitalId: hospital.id, action: 'auth.role.synced' },
      select: { entityId: true, metadata: true },
    });
    const byRole = new Map(events.map((event) => [event.entityId, event.metadata]));
    expect(byRole.get(cashier)).toMatchObject({ roleCode: 'cashier', added: ['payments.receipt.create'], removed: [] });
    expect(byRole.get(billingClerk)).toMatchObject({ roleCode: 'billing_clerk', added: [], removed: ['payments.receipt.create'] });
    // Custom roles belong to the hospital admin and are never touched.
    expect(await t.prisma.rolePermission.count({ where: { roleId: custom.id } })).toBe(1);
  });
});
