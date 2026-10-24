import { describe, expect, it } from 'vitest';
import { routeProblems, type RouteInfo } from './route-catalog.js';

const contract = { summary: 'test' };

function route(overrides: Partial<RouteInfo>): RouteInfo {
  return {
    id: 'TestController.handler',
    method: 'GET',
    path: '/api/v1/test',
    status: 200,
    isPublic: false,
    permission: 'patients.patient.read',
    contract,
    idempotent: false,
    ...overrides,
  };
}

describe('routeProblems', () => {
  it('accepts a protected route with a contract, and a reviewed public route', () => {
    expect(routeProblems([route({}), route({ isPublic: true, permission: undefined })])).toEqual([]);
  });

  it('rejects a route with neither @Public() nor @RequirePermission()', () => {
    expect(routeProblems([route({ permission: undefined })])).toEqual([
      'GET /api/v1/test (TestController.handler) needs @RequirePermission(...) or a reviewed @Public()',
    ]);
  });

  it('rejects a route with both', () => {
    expect(routeProblems([route({ isPublic: true })])[0]).toContain('has both');
  });

  it('rejects a route without a contract', () => {
    expect(routeProblems([route({ contract: undefined })])[0]).toContain('needs @ApiContract');
  });

  it('allows @Idempotent() only on signed-in POST routes', () => {
    expect(routeProblems([route({ method: 'POST', idempotent: true })])).toEqual([]);
    expect(routeProblems([route({ method: 'GET', idempotent: true })])[0]).toContain('@Idempotent()');
    expect(routeProblems([route({ method: 'POST', idempotent: true, isPublic: true, permission: undefined })])[0]).toContain(
      '@Idempotent()',
    );
  });
});
