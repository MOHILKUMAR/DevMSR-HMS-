import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createHospital, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string };
}

function code(prefix: string): string {
  return unique(prefix).toUpperCase().slice(0, 16);
}

describe('hospital profile and masters', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let otherHospital: TestHospital;
  let admin: SignedInBrowser;
  let nurse: SignedInBrowser;
  let otherAdmin: SignedInBrowser;

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    otherHospital = await createHospital(t.prisma);
    admin = await signIn(t, await createUser(t.prisma, hospital, 'hospital_admin'));
    nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    otherAdmin = await signIn(t, await createUser(t.prisma, otherHospital, 'hospital_admin'));
  });

  afterAll(async () => {
    await t.close();
  });

  describe('hospital profile', () => {
    it('can be read by any staff and changed only by the admin', async () => {
      const read = await as(request(t.http).get('/api/v1/hospital-profile'), nurse);
      expect(read.status).toBe(200);
      expect((read.body as { id: string }).id).toBe(hospital.id);

      const update = await as(request(t.http).patch('/api/v1/hospital-profile'), admin).send({ city: 'Pune', pincode: '411001' });
      expect(update.status).toBe(200);
      expect(update.body).toMatchObject({ city: 'Pune', pincode: '411001' });

      expect((await as(request(t.http).patch('/api/v1/hospital-profile'), nurse).send({ city: 'X' })).status).toBe(403);
      expect((await as(request(t.http).patch('/api/v1/hospital-profile'), admin).send({ pincode: '12345' })).status).toBe(400);
      expect((await as(request(t.http).patch('/api/v1/hospital-profile'), admin).send({})).status).toBe(400);
    });
  });

  describe('departments', () => {
    it('adds, lists, retires and restores departments', async () => {
      const deptCode = code('D');
      const created = await as(request(t.http).post('/api/v1/departments'), admin).send({ code: deptCode.toLowerCase(), name: 'Cardiology' });
      expect(created.status).toBe(201);
      const id = (created.body as { id: string; code: string }).id;
      expect((created.body as { code: string }).code).toBe(deptCode);

      expect((await as(request(t.http).post('/api/v1/departments'), admin).send({ code: deptCode, name: 'Again' })).status).toBe(409);

      const list = await as(request(t.http).get('/api/v1/departments?pageSize=100'), nurse);
      expect((list.body as { data: { id: string }[] }).data.map((d) => d.id)).toContain(id);

      expect((await as(request(t.http).patch(`/api/v1/departments/${id}`), admin).send({ isActive: false })).status).toBe(200);
      const active = await as(request(t.http).get('/api/v1/departments?pageSize=100'), nurse);
      expect((active.body as { data: { id: string }[] }).data.map((d) => d.id)).not.toContain(id);
      const all = await as(request(t.http).get('/api/v1/departments?pageSize=100&includeInactive=true'), nurse);
      expect((all.body as { data: { id: string }[] }).data.map((d) => d.id)).toContain(id);
    });

    it('only the admin may change departments, and another hospital department is 404', async () => {
      expect((await as(request(t.http).post('/api/v1/departments'), nurse).send({ code: code('N'), name: 'Nope' })).status).toBe(403);
      const foreign = await as(request(t.http).post('/api/v1/departments'), otherAdmin).send({ code: code('F'), name: 'Foreign' });
      const foreignId = (foreign.body as { id: string }).id;
      expect((await as(request(t.http).patch(`/api/v1/departments/${foreignId}`), admin).send({ name: 'Mine now' })).status).toBe(404);
    });
  });

  describe('doctors', () => {
    let departmentId: string;

    beforeAll(async () => {
      const created = await as(request(t.http).post('/api/v1/departments'), admin).send({ code: code('DOC'), name: 'Medicine' });
      departmentId = (created.body as { id: string }).id;
    });

    it('adds a doctor linked to a doctor login', async () => {
      const login = await createUser(t.prisma, hospital, 'doctor');
      const response = await as(request(t.http).post('/api/v1/doctors'), admin).send({
        fullName: 'Dr Test Doctor',
        departmentId,
        qualification: 'MBBS',
        userId: login.id,
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ fullName: 'Dr Test Doctor', departmentName: 'Medicine', username: login.username, isVisiting: false });

      // The same login cannot belong to two doctors.
      const again = await as(request(t.http).post('/api/v1/doctors'), admin).send({ fullName: 'Dr Copy', departmentId, userId: login.id });
      expect(again.status).toBe(422);
      expect((again.body as ErrorBody).error.code).toBe('DOCTOR_LOGIN_INVALID');
    });

    it('refuses a login without the doctor queue permission', async () => {
      const cashier = await createUser(t.prisma, hospital, 'cashier');
      const response = await as(request(t.http).post('/api/v1/doctors'), admin).send({ fullName: 'Dr Wrong', departmentId, userId: cashier.id });
      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('DOCTOR_LOGIN_INVALID');
    });

    it('refuses a department of another hospital or one that does not exist', async () => {
      const foreign = await as(request(t.http).post('/api/v1/departments'), otherAdmin).send({ code: code('X'), name: 'Theirs' });
      for (const id of [(foreign.body as { id: string }).id, randomUUID()]) {
        const response = await as(request(t.http).post('/api/v1/doctors'), admin).send({ fullName: 'Dr Elsewhere', departmentId: id });
        expect(response.status).toBe(422);
        expect((response.body as ErrorBody).error.code).toBe('REFERENCE_INVALID');
      }
    });

    it('updates a doctor and filters by department', async () => {
      const created = await as(request(t.http).post('/api/v1/doctors'), admin).send({ fullName: 'Dr Visiting', departmentId });
      const id = (created.body as { id: string }).id;
      const updated = await as(request(t.http).patch(`/api/v1/doctors/${id}`), admin).send({ isVisiting: true, registrationNumber: 'MC-123' });
      expect(updated.body).toMatchObject({ isVisiting: true, registrationNumber: 'MC-123' });
      const list = await as(request(t.http).get(`/api/v1/doctors?departmentId=${departmentId}`), nurse);
      expect((list.body as { data: { id: string }[] }).data.map((d) => d.id)).toContain(id);
    });
  });

  describe('room categories, wards and beds', () => {
    it('adds a ward in a room category, adds beds, and retires one', async () => {
      const category = await as(request(t.http).post('/api/v1/room-categories'), admin).send({ code: code('RC'), name: 'Deluxe' });
      expect(category.status).toBe(201);
      const categoryId = (category.body as { id: string }).id;

      const ward = await as(request(t.http).post('/api/v1/wards'), admin).send({ code: code('W'), name: 'Deluxe wing', roomCategoryId: categoryId });
      expect(ward.status).toBe(201);
      expect(ward.body).toMatchObject({ roomCategoryName: 'Deluxe', bedCount: 0 });
      const wardId = (ward.body as { id: string }).id;

      const bed = await as(request(t.http).post(`/api/v1/wards/${wardId}/beds`), admin).send({ code: 'DX-01' });
      expect(bed.status).toBe(201);
      expect(bed.body).toMatchObject({ code: 'DX-01', status: 'free', isActive: true });
      expect((await as(request(t.http).post(`/api/v1/wards/${wardId}/beds`), admin).send({ code: 'DX-01' })).status).toBe(409);

      const beds = await as(request(t.http).get(`/api/v1/wards/${wardId}/beds`), nurse);
      expect((beds.body as { data: unknown[] }).data).toHaveLength(1);

      const bedId = (bed.body as { id: string }).id;
      expect((await as(request(t.http).patch(`/api/v1/beds/${bedId}`), admin).send({ isActive: false })).body).toMatchObject({ isActive: false });
    });

    it('never retires an occupied bed, or a ward with a patient in it', async () => {
      const ward = await as(request(t.http).post('/api/v1/wards'), admin).send({ code: code('WO'), name: 'Occupied ward' });
      const wardId = (ward.body as { id: string }).id;
      const bed = await as(request(t.http).post(`/api/v1/wards/${wardId}/beds`), admin).send({ code: 'OC-01' });
      const bedId = (bed.body as { id: string }).id;
      // Admission arrives with the IPD slice; until then a patient is placed directly.
      await t.prisma.bed.update({ where: { id: bedId }, data: { status: 'occupied' } });

      const retireBed = await as(request(t.http).patch(`/api/v1/beds/${bedId}`), admin).send({ isActive: false });
      expect(retireBed.status).toBe(422);
      expect((retireBed.body as ErrorBody).error.code).toBe('BED_OCCUPIED');
      const retireWard = await as(request(t.http).patch(`/api/v1/wards/${wardId}`), admin).send({ isActive: false });
      expect((retireWard.body as ErrorBody).error.code).toBe('BED_OCCUPIED');
      expect((await t.prisma.bed.findUniqueOrThrow({ where: { id: bedId } })).isActive).toBe(true);
    });

    it('waits for a patient being placed at the same moment, then refuses to retire the ward', async () => {
      const ward = await as(request(t.http).post('/api/v1/wards'), admin).send({ code: code('WR'), name: 'Race ward' });
      const wardId = (ward.body as { id: string }).id;
      const bed = await as(request(t.http).post(`/api/v1/wards/${wardId}/beds`), admin).send({ code: 'RC-01' });
      const bedId = (bed.body as { id: string }).id;

      // An admission in progress: it holds the bed's lock and has filled the bed, but has not committed.
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let lockTaken = (): void => undefined;
      const locked = new Promise<void>((resolve) => {
        lockTaken = resolve;
      });
      const admission = t.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM beds WHERE id = ${bedId}::uuid FOR UPDATE`;
          await tx.bed.update({ where: { id: bedId }, data: { status: 'occupied' } });
          lockTaken();
          await held;
        },
        { timeout: 20_000 },
      );
      await locked;

      let settled = false;
      const retire = as(request(t.http).patch(`/api/v1/wards/${wardId}`), admin)
        .send({ isActive: false })
        .then((response) => {
          settled = true;
          return response;
        });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(settled).toBe(false);

      release();
      await admission;
      const response = await retire;
      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('BED_OCCUPIED');
      expect((await t.prisma.ward.findUniqueOrThrow({ where: { id: wardId } })).isActive).toBe(true);
    });

    it('keeps another hospital wards and beds out of reach', async () => {
      const ward = await as(request(t.http).post('/api/v1/wards'), otherAdmin).send({ code: code('OW'), name: 'Their ward' });
      const wardId = (ward.body as { id: string }).id;
      expect((await as(request(t.http).get(`/api/v1/wards/${wardId}/beds`), nurse)).status).toBe(404);
      expect((await as(request(t.http).post(`/api/v1/wards/${wardId}/beds`), admin).send({ code: 'B-1' })).status).toBe(404);
      expect((await as(request(t.http).patch(`/api/v1/wards/${wardId}`), admin).send({ name: 'Mine' })).status).toBe(404);
    });

    it('refuses a room category of another hospital', async () => {
      const theirs = await as(request(t.http).post('/api/v1/room-categories'), otherAdmin).send({ code: code('TC'), name: 'Theirs' });
      const response = await as(request(t.http).post('/api/v1/wards'), admin).send({
        code: code('WX'),
        name: 'Mixed',
        roomCategoryId: (theirs.body as { id: string }).id,
      });
      expect(response.status).toBe(422);
    });
  });
});
