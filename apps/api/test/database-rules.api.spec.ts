import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseRoleProblems } from '../src/common/startup/database-role-check.js';
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

  it('keeps audit events append-only: no UPDATE, DELETE or TRUNCATE, even for the table owner', async () => {
    const event = await t.prisma.auditEvent.create({ data: { action: 'test.rule.checked', hospitalId: hospital.id } });
    await expect(t.owner.auditEvent.update({ where: { id: event.id }, data: { action: 'test.rule.changed' } })).rejects.toThrow(
      /not allowed/,
    );
    await expect(t.owner.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/not allowed/);
    await expect(t.owner.$executeRawUnsafe('TRUNCATE audit_events')).rejects.toThrow(/not allowed/);
    expect(await t.prisma.auditEvent.count({ where: { id: event.id, action: 'test.rule.checked' } })).toBe(1);
  });

  it('keeps login history append-only', async () => {
    const event = await t.prisma.loginEvent.create({ data: { username: 'someone', outcome: 'unknown_user' } });
    await expect(t.owner.loginEvent.delete({ where: { id: event.id } })).rejects.toThrow(/not allowed/);
  });

  it('never hard deletes a patient', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    await expect(t.owner.patient.delete({ where: { id: patient.id } })).rejects.toThrow(/not allowed/);
  });

  describe("the API's database role", () => {
    it('has no UPDATE, DELETE or TRUNCATE privilege on audit rows', async () => {
      const event = await t.prisma.auditEvent.create({ data: { action: 'test.rule.checked', hospitalId: hospital.id } });
      const login = await t.prisma.loginEvent.create({ data: { username: 'someone', outcome: 'unknown_user' } });
      await expect(t.prisma.auditEvent.update({ where: { id: event.id }, data: { action: 'x' } })).rejects.toThrow(/permission denied/);
      await expect(t.prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/permission denied/);
      await expect(t.prisma.loginEvent.delete({ where: { id: login.id } })).rejects.toThrow(/permission denied/);
      await expect(t.prisma.$executeRawUnsafe('TRUNCATE audit_events')).rejects.toThrow(/permission denied/);
      await expect(t.prisma.$executeRawUnsafe('TRUNCATE login_events')).rejects.toThrow(/permission denied/);
    });

    it('cannot delete clinical or financial records at all', async () => {
      const patient = await createPatient(t.prisma, hospital.id);
      await expect(t.prisma.patient.delete({ where: { id: patient.id } })).rejects.toThrow(/permission denied/);
      await expect(t.prisma.$executeRawUnsafe('TRUNCATE invoices CASCADE')).rejects.toThrow(/permission denied/);
    });

    it('cannot change the schema or switch off a trigger', async () => {
      await expect(t.prisma.$executeRawUnsafe('ALTER TABLE audit_events DISABLE TRIGGER USER')).rejects.toThrow(/must be owner/);
      await expect(t.prisma.$executeRawUnsafe('DROP TABLE audit_events')).rejects.toThrow(/must be owner/);
      await expect(t.prisma.$executeRawUnsafe('CREATE TABLE test_rule_probe (id int)')).rejects.toThrow(/permission denied/);
    });

    it('cannot read migration history', async () => {
      await expect(t.prisma.$queryRawUnsafe('SELECT count(*) FROM _prisma_migrations')).rejects.toThrow(/permission denied/);
    });

    it('passes the production check, which the owner fails', async () => {
      expect(await databaseRoleProblems(t.prisma)).toEqual([]);
      expect(await databaseRoleProblems(t.owner)).not.toEqual([]);
    });
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
