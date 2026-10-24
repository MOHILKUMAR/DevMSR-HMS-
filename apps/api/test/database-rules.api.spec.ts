import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHospital, createPatient, unique, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// Rules enforced by the database itself, so no code path (or person with SQL access through the app's
// connection) can break them.
describe('database rules', () => {
  let t: TestApp;
  let hospital: TestHospital;

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('keeps audit events append-only: no UPDATE, DELETE or TRUNCATE', async () => {
    const event = await t.prisma.auditEvent.create({ data: { action: 'test.rule.checked', hospitalId: hospital.id } });
    await expect(t.prisma.auditEvent.update({ where: { id: event.id }, data: { action: 'test.rule.changed' } })).rejects.toThrow(
      /not allowed/,
    );
    await expect(t.prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/not allowed/);
    await expect(t.prisma.$executeRawUnsafe('TRUNCATE audit_events')).rejects.toThrow(/not allowed/);
    expect(await t.prisma.auditEvent.count({ where: { id: event.id, action: 'test.rule.checked' } })).toBe(1);
  });

  it('keeps login history append-only', async () => {
    const event = await t.prisma.loginEvent.create({ data: { username: 'someone', outcome: 'unknown_user' } });
    await expect(t.prisma.loginEvent.delete({ where: { id: event.id } })).rejects.toThrow(/not allowed/);
  });

  it('never hard deletes a patient', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    await expect(t.prisma.patient.delete({ where: { id: patient.id } })).rejects.toThrow(/not allowed/);
  });

  it('requires a hospital for staff users and none for platform users', async () => {
    const base = { displayName: 'Rule check', passwordHash: 'x' };
    await expect(t.prisma.user.create({ data: { ...base, username: unique('staff'), kind: 'staff', hospitalId: null } })).rejects.toThrow();
    await expect(
      t.prisma.user.create({ data: { ...base, username: unique('platform'), kind: 'platform', hospitalId: hospital.id } }),
    ).rejects.toThrow();
  });

  it('stores usernames lowercase only', async () => {
    await expect(
      t.prisma.user.create({ data: { displayName: 'x', passwordHash: 'x', username: 'Mixed-Case', hospitalId: hospital.id } }),
    ).rejects.toThrow();
  });

  it('cannot attach a bed to another hospital ward', async () => {
    const other = await createHospital(t.prisma);
    const ward = await t.prisma.ward.create({ data: { hospitalId: other.id, branchId: other.branchId, code: 'W1', name: 'Ward' } });
    await expect(t.prisma.bed.create({ data: { hospitalId: hospital.id, wardId: ward.id, code: 'B1' } })).rejects.toThrow();
  });

  it('cannot attach a ward to another hospital branch', async () => {
    const other = await createHospital(t.prisma);
    await expect(t.prisma.ward.create({ data: { hospitalId: hospital.id, branchId: other.branchId, code: 'W2', name: 'Ward' } })).rejects.toThrow();
  });

  it('keeps platform role codes unique', async () => {
    const code = unique('platform_role');
    await t.prisma.role.create({ data: { hospitalId: null, code, name: 'One' } });
    await expect(t.prisma.role.create({ data: { hospitalId: null, code, name: 'Two' } })).rejects.toThrow();
  });
});
