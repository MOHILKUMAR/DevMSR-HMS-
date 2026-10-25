// Loads a fake demo hospital for local development: platform and hospital roles from the permission
// matrix, one user per role, wards and beds, and 50 fake patients. Safe to run more than once.
// Run with `pnpm db:seed`. Never runs in production and never loads real patient data.

import { hashPassword } from '../apps/api/src/auth/password.js';
import { ROLES, requiresTwoFactor } from '../apps/api/src/auth/permission-matrix.js';
import { syncHospitalRoles, syncPermissions, syncPlatformRoles } from '../apps/api/src/auth/role-sync.js';
import { createFieldCipher } from '../apps/api/src/common/crypto/field-encryption.js';
import { todayIst } from '../apps/api/src/common/dates.js';
import { createPrismaClient } from '../apps/api/src/common/prisma/create-prisma-client.js';
import { formatUhid, takeNumber } from '../apps/api/src/numbering/take-number.js';
import {
  createRandom,
  DEMO_BRANCH,
  DEMO_DEPARTMENTS,
  DEMO_DOCTORS,
  DEMO_HOSPITAL,
  DEMO_HOSPITAL_DETAILS,
  DEMO_RATES_FROM,
  DEMO_ROOM_CATEGORIES,
  DEMO_SERVICE_ITEMS,
  DEMO_USERS,
  DEMO_WARDS,
  digits,
  FEMALE_FIRST_NAMES,
  LAST_NAMES,
  MALE_FIRST_NAMES,
  PATIENT_COUNT,
  pick,
} from './seed-data.js';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

if (process.env['NODE_ENV'] === 'production' || process.env['APP_ENV'] === 'production') {
  throw new Error('The seed loads fake data and never runs in production.');
}

const prisma = createPrismaClient(required('DATABASE_URL'));
const cipher = createFieldCipher(required('FIELD_ENCRYPTION_KEY'));
const passwordHash = await hashPassword(required('SEED_USER_PASSWORD'));
// Demo users whose role needs two-factor get this base32 secret, so a developer adds it to an
// authenticator app once and the e2e tests can make codes. Without it they set it up at first sign-in.
const totpSecret = process.env['SEED_TOTP_SECRET'] ?? '';
if (totpSecret !== '' && !/^[A-Z2-7]{16,}$/.test(totpSecret)) {
  throw new Error('SEED_TOTP_SECRET must be base32: 16 or more of A to Z and 2 to 7.');
}

try {
  const summary = await prisma.$transaction(
    async (tx) => {
      const permissionIds = await syncPermissions(tx);
      const platformRoles = await syncPlatformRoles(tx, permissionIds);

      const hospital = await tx.hospital.upsert({
        where: { code: DEMO_HOSPITAL.code },
        create: { ...DEMO_HOSPITAL, ...DEMO_HOSPITAL_DETAILS },
        update: { name: DEMO_HOSPITAL.name, ...DEMO_HOSPITAL_DETAILS },
        select: { id: true },
      });
      const branch = await tx.branch.upsert({
        where: { hospitalId_code: { hospitalId: hospital.id, code: DEMO_BRANCH.code } },
        create: { hospitalId: hospital.id, ...DEMO_BRANCH },
        update: { name: DEMO_BRANCH.name },
        select: { id: true },
      });
      const hospitalRoles = await syncHospitalRoles(tx, hospital.id, permissionIds);

      const userIds = new Map<string, string>();
      for (const demo of DEMO_USERS) {
        const platform = demo.role === 'super_admin';
        const roleId = (platform ? platformRoles : hospitalRoles).get(demo.role);
        if (roleId === undefined) throw new Error(`Role ${demo.role} was not created`);
        const account = {
          hospitalId: platform ? null : hospital.id,
          kind: platform ? ('platform' as const) : ('staff' as const),
          displayName: demo.displayName,
          passwordHash,
          isActive: true,
          failedLoginCount: 0,
          lockedUntil: null,
          mustChangePassword: false,
          ...(totpSecret !== '' && requiresTwoFactor(ROLES[demo.role].permissions)
            ? { totpSecretEncrypted: cipher.seal('totp_secret', totpSecret), totpEnabledAt: new Date(), totpLastTimeStep: null }
            : {}),
        };
        const user = await tx.user.upsert({
          where: { username: demo.username },
          create: { username: demo.username, ...account },
          update: account,
          select: { id: true },
        });
        await tx.userRole.createMany({ data: [{ userId: user.id, roleId }], skipDuplicates: true });
        userIds.set(demo.username, user.id);
      }

      const departmentIds = new Map<string, string>();
      for (const department of DEMO_DEPARTMENTS) {
        const { id } = await tx.department.upsert({
          where: { hospitalId_code: { hospitalId: hospital.id, code: department.code } },
          create: { hospitalId: hospital.id, ...department },
          update: { name: department.name },
          select: { id: true },
        });
        departmentIds.set(department.code, id);
      }

      // Doctors have no natural unique key, so the seed matches them by name within the hospital.
      const doctorIds = new Map<string, string>();
      for (const demo of DEMO_DOCTORS) {
        const departmentId = departmentIds.get(demo.department);
        if (departmentId === undefined) throw new Error(`Department ${demo.department} was not created`);
        const doctor = {
          departmentId,
          qualification: demo.qualification,
          registrationNumber: demo.registrationNumber,
          userId: demo.username === undefined ? null : (userIds.get(demo.username) ?? null),
          isVisiting: demo.isVisiting ?? false,
          isActive: true,
        };
        const existing = await tx.doctor.findFirst({ where: { hospitalId: hospital.id, fullName: demo.fullName }, select: { id: true } });
        const { id } = existing
          ? await tx.doctor.update({ where: { id: existing.id }, data: doctor, select: { id: true } })
          : await tx.doctor.create({ data: { hospitalId: hospital.id, fullName: demo.fullName, ...doctor }, select: { id: true } });
        doctorIds.set(demo.fullName, id);
      }

      const roomCategoryIds = new Map<string, string>();
      for (const category of DEMO_ROOM_CATEGORIES) {
        const { id } = await tx.roomCategory.upsert({
          where: { hospitalId_code: { hospitalId: hospital.id, code: category.code } },
          create: { hospitalId: hospital.id, ...category },
          update: { name: category.name },
          select: { id: true },
        });
        roomCategoryIds.set(category.code, id);
      }

      let bedCount = 0;
      for (const ward of DEMO_WARDS) {
        const roomCategoryId = roomCategoryIds.get(ward.roomCategory) ?? null;
        const { id: wardId } = await tx.ward.upsert({
          where: { hospitalId_code: { hospitalId: hospital.id, code: ward.code } },
          create: { hospitalId: hospital.id, branchId: branch.id, code: ward.code, name: ward.name, roomCategoryId },
          update: { name: ward.name, roomCategoryId },
          select: { id: true },
        });
        for (let n = 1; n <= ward.beds; n += 1) {
          const code = `${ward.code}-${String(n).padStart(2, '0')}`;
          const status = ward.statuses?.[n] ?? 'free';
          await tx.bed.upsert({
            where: { wardId_code: { wardId, code } },
            create: { hospitalId: hospital.id, wardId, code, status },
            update: {},
          });
          bedCount += 1;
        }
      }

      // Fake demo rates. An item that already has a rate keeps its history untouched.
      for (const demo of DEMO_SERVICE_ITEMS) {
        const item = await tx.serviceItem.upsert({
          where: { hospitalId_code: { hospitalId: hospital.id, code: demo.code } },
          create: {
            hospitalId: hospital.id,
            code: demo.code,
            name: demo.name,
            kind: demo.kind,
            doctorId: demo.doctor === undefined ? null : (doctorIds.get(demo.doctor) ?? null),
            roomCategoryId: demo.roomCategory === undefined ? null : (roomCategoryIds.get(demo.roomCategory) ?? null),
          },
          update: { name: demo.name },
          select: { id: true, _count: { select: { rates: true } } },
        });
        if (item._count.rates === 0) {
          await tx.tariffRate.create({
            data: {
              hospitalId: hospital.id,
              serviceItemId: item.id,
              ratePaise: BigInt(demo.ratePaise),
              taxRateBp: 0,
              effectiveFrom: new Date(`${DEMO_RATES_FROM}T00:00:00.000Z`),
            },
          });
        }
      }

      const existingPatients = await tx.patient.count({ where: { hospitalId: hospital.id } });
      const random = createRandom(20_261_025);
      const createdById = userIds.get('reception') ?? null;
      // Fake patients take UHIDs from the same counter as registrations at the desk.
      const uhidYear = todayIst().slice(0, 4);
      for (let i = existingPatients; i < PATIENT_COUNT; i += 1) {
        const male = random() < 0.5;
        const firstName = pick(random, male ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES);
        const year = 1945 + Math.floor(random() * 80);
        const dateOfBirth = new Date(Date.UTC(year, Math.floor(random() * 12), 1 + Math.floor(random() * 28)));
        const aadhaar = i % 3 === 0 ? cipher.protect('aadhaar', `0${digits(random, 11)}`) : null;
        const abha = i % 5 === 0 ? cipher.protect('abha_number', `00${digits(random, 12)}`) : null;
        const uhid = formatUhid(DEMO_HOSPITAL.code, uhidYear, await takeNumber(tx, hospital.id, 'uhid', uhidYear));
        await tx.patient.create({
          data: {
            hospitalId: hospital.id,
            uhid,
            fullName: `${firstName} ${pick(random, LAST_NAMES)}`,
            sex: male ? 'male' : 'female',
            dateOfBirth,
            phone: `+910${digits(random, 9)}`,
            aadhaarEncrypted: aadhaar?.encrypted ?? null,
            aadhaarLast4: aadhaar?.last4 ?? null,
            aadhaarBlindIndex: aadhaar?.blindIndex ?? null,
            abhaNumberEncrypted: abha?.encrypted ?? null,
            abhaNumberLast4: abha?.last4 ?? null,
            abhaNumberBlindIndex: abha?.blindIndex ?? null,
            createdById,
          },
        });
      }

      return {
        permissions: permissionIds.size,
        roles: platformRoles.size + hospitalRoles.size,
        users: userIds.size,
        departments: departmentIds.size,
        doctors: doctorIds.size,
        serviceItems: DEMO_SERVICE_ITEMS.length,
        wards: DEMO_WARDS.length,
        beds: bedCount,
        patients: await tx.patient.count({ where: { hospitalId: hospital.id } }),
      };
    },
    { timeout: 60_000 },
  );

  log(`Seeded ${DEMO_HOSPITAL.name}: ${JSON.stringify(summary)}`);
  log(`Usernames: ${DEMO_USERS.map((user) => user.username).join(', ')}. Password: SEED_USER_PASSWORD from .env.`);
  log(
    totpSecret === ''
      ? 'superadmin, admin and accounts set up two-factor at first sign-in (SEED_TOTP_SECRET is empty).'
      : 'superadmin, admin and accounts use two-factor with SEED_TOTP_SECRET from .env.',
  );
} finally {
  await prisma.$disconnect();
}
