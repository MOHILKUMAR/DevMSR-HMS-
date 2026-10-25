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

  it('lists every route with its permission (update this list when adding a route, after review)', () => {
    expect(routes.map((r) => `${r.method} ${r.path} ${r.isPublic ? 'public' : (r.permission ?? 'none')}`).sort()).toEqual(
      [
        'GET /api/v1/auth/csrf public',
        'POST /api/v1/auth/login public',
        'POST /api/v1/auth/logout auth.session.manage-own',
        'GET /api/v1/auth/me auth.session.manage-own',
        'PATCH /api/v1/beds/:id masters.data.manage',
        'GET /api/v1/departments masters.data.read',
        'POST /api/v1/departments masters.data.manage',
        'PATCH /api/v1/departments/:id masters.data.manage',
        'GET /api/v1/doctors masters.data.read',
        'POST /api/v1/doctors masters.data.manage',
        'PATCH /api/v1/doctors/:id masters.data.manage',
        'GET /api/v1/health public',
        'GET /api/v1/hospital-profile masters.data.read',
        'PATCH /api/v1/hospital-profile settings.hospital.manage',
        'POST /api/v1/patients/:id/charges billing.charge.create',
        'GET /api/v1/patients/:id/charges billing.account.read',
        'GET /api/v1/patients/:id/account billing.account.read',
        'POST /api/v1/invoices billing.invoice.create',
        'GET /api/v1/invoices billing.account.read',
        'GET /api/v1/invoices/:id billing.account.read',
        'POST /api/v1/invoices/:id/issue billing.invoice.issue',
        'POST /api/v1/invoices/:id/discard billing.invoice.create',
        'POST /api/v1/invoices/:id/apply-deposit payments.receipt.create',
        'POST /api/v1/payments payments.receipt.create',
        'POST /api/v1/deposits payments.deposit.create',
        'GET /api/v1/receipts/:id billing.account.read',
        'POST /api/v1/cash-shifts payments.shift.manage-own',
        'GET /api/v1/cash-shifts/current payments.shift.manage-own',
        'POST /api/v1/cash-shifts/:id/close payments.shift.manage-own',
        'GET /api/v1/cash-shifts reports.collection.read',
        'POST /api/v1/discount-requests billing.discount.request',
        'POST /api/v1/discount-requests/:id/approve billing.discount.approve',
        'POST /api/v1/discount-requests/:id/reject billing.discount.approve',
        'POST /api/v1/credit-note-requests billing.credit-note.request',
        'POST /api/v1/credit-note-requests/:id/approve billing.credit-note.approve',
        'POST /api/v1/credit-note-requests/:id/reject billing.credit-note.approve',
        'POST /api/v1/refund-requests billing.refund.request',
        'POST /api/v1/refund-requests/:id/approve billing.refund.approve',
        'POST /api/v1/refund-requests/:id/reject billing.refund.approve',
        'POST /api/v1/refund-requests/:id/pay payments.refund.pay',
        'POST /api/v1/void-requests payments.receipt.void-request',
        'POST /api/v1/void-requests/:id/approve billing.void.approve',
        'POST /api/v1/void-requests/:id/reject billing.void.approve',
        'GET /api/v1/approval-requests billing.account.read',
        'GET /api/v1/approval-requests/:id billing.account.read',
        'GET /api/v1/credit-notes/:id billing.account.read',
        'GET /api/v1/refunds/:id billing.account.read',
        'POST /api/v1/patients patients.patient.create',
        'POST /api/v1/patients/search patients.patient.read',
        'POST /api/v1/patients/duplicate-check patients.patient.create',
        'GET /api/v1/patients/:id patients.patient.read',
        'PATCH /api/v1/patients/:id patients.patient.update',
        'GET /api/v1/roles users.user.manage',
        'GET /api/v1/room-categories masters.data.read',
        'POST /api/v1/room-categories masters.data.manage',
        'PATCH /api/v1/room-categories/:id masters.data.manage',
        'GET /api/v1/service-items tariffs.tariff.read',
        'POST /api/v1/service-items tariffs.tariff.manage',
        'PATCH /api/v1/service-items/:id tariffs.tariff.manage',
        'GET /api/v1/service-items/:id/rates tariffs.tariff.read',
        'POST /api/v1/service-items/:id/rates tariffs.tariff.manage',
        'POST /api/v1/service-items/:id/rates/:rateId/cancel tariffs.tariff.manage',
        'GET /api/v1/users users.user.manage',
        'POST /api/v1/users users.user.manage',
        'PATCH /api/v1/users/:id users.user.manage',
        'POST /api/v1/users/:id/password users.user.manage',
        'GET /api/v1/wards masters.data.read',
        'POST /api/v1/wards masters.data.manage',
        'PATCH /api/v1/wards/:id masters.data.manage',
        'GET /api/v1/wards/:id/beds masters.data.read',
        'POST /api/v1/wards/:id/beds masters.data.manage',
      ].sort(),
    );
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
