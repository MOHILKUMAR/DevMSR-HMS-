import { randomUUID } from 'node:crypto';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPermissionCode, PERMISSIONS, ROLES, type RoleCode } from '../src/auth/permission-matrix.js';
import { listRoutes, type RouteInfo } from '../src/common/routes/route-catalog.js';
import { anonymousBrowser, as, createHospital, createUser, signIn, type Browser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Statuses that mean the pipeline let the caller through to validation or the handler. */
const BLOCKED = [401, 403, 429, 500];

function call(t: TestApp, route: RouteInfo, browser: Browser | undefined): request.Test {
  const path = route.path.replace(/:[A-Za-z]+/g, () => randomUUID());
  const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const req = request(t.http)[method](path);
  return browser === undefined ? req : as(req, browser);
}

describe('permission matrix: every route as every role', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let routes: RouteInfo[];

  beforeAll(async () => {
    // Login limit raised: this test calls the login route once per role from one IP.
    t = await createTestApp({ env: { RATE_LIMIT_LOGIN_PER_MINUTE: '1000' } });
    hospital = await createHospital(t.prisma);
    routes = listRoutes(t.app.get(DiscoveryService), t.app.get(MetadataScanner));
  });

  afterAll(async () => {
    await t.close();
  });

  it('lists every route with its permission (update this list when adding a route)', () => {
    expect(routes.map((r) => `${r.method} ${r.path} ${r.isPublic ? 'public' : (r.permission ?? 'none')}`)).toEqual([
      'GET /api/v1/auth/csrf public',
      'POST /api/v1/auth/login public',
      'POST /api/v1/auth/logout auth.session.manage-own',
      'GET /api/v1/auth/me auth.session.manage-own',
      'GET /api/v1/health public',
    ]);
  });

  it('uses only permission codes from the matrix', () => {
    for (const route of routes) {
      if (route.permission !== undefined) expect(isPermissionCode(route.permission), route.id).toBe(true);
    }
    expect(Object.keys(PERMISSIONS).length).toBeGreaterThan(0);
  });

  it('anonymous: public routes open, every other route 401', async () => {
    for (const route of routes) {
      const browser = route.method === 'GET' ? undefined : await anonymousBrowser(t.http);
      const status = (await call(t, route, browser)).status;
      const label = `anonymous ${route.method} ${route.path}`;
      if (route.isPublic) {
        expect(BLOCKED, label).not.toContain(status);
      } else {
        expect(status, label).toBe(401);
      }
    }
  });

  for (const role of Object.keys(ROLES) as RoleCode[]) {
    it(`${role}: routes it holds the permission for open, every other route 403`, async () => {
      const user = await createUser(t.prisma, hospital, role);
      const granted: readonly string[] = ROLES[role].permissions;
      for (const route of routes) {
        // A fresh session per call, because one of the routes is logout.
        const browser = await signIn(t, user);
        const status = (await call(t, route, browser)).status;
        const label = `${role} ${route.method} ${route.path}`;
        if (route.isPublic || (route.permission !== undefined && granted.includes(route.permission))) {
          expect(BLOCKED, label).not.toContain(status);
        } else {
          expect(status, label).toBe(403);
        }
      }
    });
  }
});
