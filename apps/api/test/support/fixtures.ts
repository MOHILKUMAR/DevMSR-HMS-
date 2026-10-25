import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthCookies } from '../../src/auth/auth-cookies.js';
import { CsrfService } from '../../src/auth/csrf.service.js';
import { hashPassword } from '../../src/auth/password.js';
import { ROLES, type RoleCode } from '../../src/auth/permission-matrix.js';
import { syncHospitalRoles, syncPermissions, syncPlatformRoles } from '../../src/auth/role-sync.js';
import { SessionsService } from '../../src/auth/sessions.service.js';
import type { PrismaService } from '../../src/common/prisma/prisma.service.js';
import type { TestApp } from './test-app.js';

export const TEST_PASSWORD = 'test-only-Passw0rd';

// Fixture users get a cheap Argon2id hash so tests stay fast. verify() reads the cost from the hash,
// so login behaves the same; production cost lives in password.ts.
let testPasswordHash: Promise<string> | undefined;
function passwordHash(): Promise<string> {
  testPasswordHash ??= hashPassword(TEST_PASSWORD, { memoryCost: 1024, timeCost: 1, parallelism: 1 });
  return testPasswordHash;
}

/** Test files run in parallel against one database, so every code and username is unique. */
export function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

export interface TestHospital {
  id: string;
  code: string;
  branchId: string;
  roleIds: Map<RoleCode, string>;
}

export async function createHospital(prisma: PrismaService): Promise<TestHospital> {
  const permissionIds = await syncPermissions(prisma);
  const code = unique('H').toUpperCase();
  const hospital = await prisma.hospital.create({ data: { code, name: `Test hospital ${code}` }, select: { id: true } });
  const branch = await prisma.branch.create({ data: { hospitalId: hospital.id, code: 'MAIN', name: 'Main' }, select: { id: true } });
  const roleIds = await syncHospitalRoles(prisma, hospital.id, permissionIds);
  return { id: hospital.id, code, branchId: branch.id, roleIds };
}

export interface TestUser {
  id: string;
  username: string;
  hospitalId: string | null;
}

/** A user holding one seeded role. Platform roles ignore the hospital. */
export async function createUser(
  prisma: PrismaService,
  hospital: TestHospital,
  role: RoleCode,
  options: { isActive?: boolean } = {},
): Promise<TestUser> {
  const platform = ROLES[role].scope === 'platform';
  const roleId = platform ? (await syncPlatformRoles(prisma, await syncPermissions(prisma))).get(role) : hospital.roleIds.get(role);
  if (roleId === undefined) throw new Error(`No role ${role}`);
  const username = unique(role.replace(/_/g, '-'));
  const user = await prisma.user.create({
    data: {
      hospitalId: platform ? null : hospital.id,
      kind: platform ? 'platform' : 'staff',
      username,
      displayName: `Test ${role}`,
      passwordHash: await passwordHash(),
      isActive: options.isActive ?? true,
    },
    select: { id: true, hospitalId: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId } });
  return { id: user.id, username, hospitalId: user.hospitalId };
}

export async function createPatient(prisma: PrismaService, hospitalId: string): Promise<{ id: string }> {
  return prisma.patient.create({
    data: { hospitalId, fullName: 'Test Patient', sex: 'female', phone: '+910000000000' },
    select: { id: true },
  });
}

/** What a browser sends: the Cookie header and the X-CSRF-Token header value. */
export interface Browser {
  cookie: string;
  csrfToken: string;
}

export interface SignedInBrowser extends Browser {
  sessionId: string;
}

/** Starts a session directly (no password hashing), as a signed-in browser would hold it. */
export async function signIn(testApp: TestApp, user: TestUser): Promise<SignedInBrowser> {
  const sessions = testApp.app.get(SessionsService);
  const csrf = testApp.app.get(CsrfService);
  const cookies = testApp.app.get(AuthCookies);
  const session = await sessions.start(user, { requestId: 'test', ipAddress: null, userAgent: null }, new Date());
  const csrfToken = csrf.issue(session.id);
  return {
    cookie: `${cookies.sessionName}=${session.token}; ${cookies.csrfName}=${csrfToken}`,
    csrfToken,
    sessionId: session.id,
  };
}

/** `name=value` pairs from Set-Cookie headers. */
export function cookiePairs(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  const lines = header === undefined ? [] : Array.isArray(header) ? header : [header];
  return lines.map((line) => line.split(';')[0] ?? '').filter((pair) => !pair.endsWith('='));
}

/** A browser on the login screen: it has fetched a pre-login CSRF token. */
export async function anonymousBrowser(http: Server): Promise<Browser> {
  const response = await request(http).get('/api/v1/auth/csrf').expect(200);
  const body = response.body as { csrfToken: string };
  return { cookie: cookiePairs(response).join('; '), csrfToken: body.csrfToken };
}

/** Adds a browser's cookies and CSRF header to a request. */
export function as<T extends request.Test>(req: T, browser: Browser): T {
  return req.set('Cookie', browser.cookie).set('X-CSRF-Token', browser.csrfToken);
}
