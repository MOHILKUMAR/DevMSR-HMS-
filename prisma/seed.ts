// Loads a fake demo hospital for local development: platform and hospital roles from the permission
// matrix, one user per role, wards and beds, and 50 fake patients. Safe to run more than once.
// Run with `pnpm db:seed`. Never runs in production and never loads real patient data.

import { hashPassword } from '../apps/api/src/auth/password.js';
import { syncHospitalRoles, syncPermissions, syncPlatformRoles } from '../apps/api/src/auth/role-sync.js';
import { createFieldCipher } from '../apps/api/src/common/crypto/field-encryption.js';
import { createPrismaClient } from '../apps/api/src/common/prisma/create-prisma-client.js';
import {
  createRandom,
  DEMO_BRANCH,
  DEMO_HOSPITAL,
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

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('The seed loads fake data and never runs in production.');
}

const prisma = createPrismaClient(required('DATABASE_URL'));
const cipher = createFieldCipher(required('FIELD_ENCRYPTION_KEY'));
const passwordHash = await hashPassword(required('SEED_USER_PASSWORD'));

try {
  const summary = await prisma.$transaction(
    async (tx) => {
      const permissionIds = await syncPermissions(tx);
      const platformRoles = await syncPlatformRoles(tx, permissionIds);

      const hospital = await tx.hospital.upsert({
        where: { code: DEMO_HOSPITAL.code },
        create: DEMO_HOSPITAL,
        update: { name: DEMO_HOSPITAL.name },
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

      let bedCount = 0;
      for (const ward of DEMO_WARDS) {
        const { id: wardId } = await tx.ward.upsert({
          where: { hospitalId_code: { hospitalId: hospital.id, code: ward.code } },
          create: { hospitalId: hospital.id, branchId: branch.id, code: ward.code, name: ward.name },
          update: { name: ward.name },
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

      const existingPatients = await tx.patient.count({ where: { hospitalId: hospital.id } });
      const random = createRandom(20_261_025);
      const createdById = userIds.get('reception') ?? null;
      for (let i = existingPatients; i < PATIENT_COUNT; i += 1) {
        const male = random() < 0.5;
        const firstName = pick(random, male ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES);
        const year = 1945 + Math.floor(random() * 80);
        const dateOfBirth = new Date(Date.UTC(year, Math.floor(random() * 12), 1 + Math.floor(random() * 28)));
        const aadhaar = i % 3 === 0 ? cipher.protect('aadhaar', `0${digits(random, 11)}`) : null;
        const abha = i % 5 === 0 ? cipher.protect('abha_number', `00${digits(random, 12)}`) : null;
        await tx.patient.create({
          data: {
            hospitalId: hospital.id,
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
        wards: DEMO_WARDS.length,
        beds: bedCount,
        patients: await tx.patient.count({ where: { hospitalId: hospital.id } }),
      };
    },
    { timeout: 60_000 },
  );

  log(`Seeded ${DEMO_HOSPITAL.name}: ${JSON.stringify(summary)}`);
  log(`Usernames: ${DEMO_USERS.map((user) => user.username).join(', ')}. Password: SEED_USER_PASSWORD from .env.`);
} finally {
  await prisma.$disconnect();
}
