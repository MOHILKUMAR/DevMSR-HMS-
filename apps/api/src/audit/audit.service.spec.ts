import { describe, expect, it, vi } from 'vitest';
import type { AuditRepository } from './audit.repository.js';
import { AuditService } from './audit.service.js';

function setup() {
  const insert = vi.fn<AuditRepository['insert']>().mockResolvedValue(undefined);
  const service = new AuditService({ insert } as unknown as AuditRepository);
  return { service, insert };
}

describe('AuditService', () => {
  it('writes the entry with request metadata', async () => {
    const { service, insert } = setup();
    await service.record({
      action: 'auth.session.created',
      hospitalId: 'h1',
      actorUserId: 'u1',
      entityType: 'session',
      entityId: 's1',
      meta: { requestId: 'r1', ipAddress: '10.0.0.1', userAgent: 'test' },
      details: { reason: 'login' },
    });
    expect(insert).toHaveBeenCalledWith(
      {
        action: 'auth.session.created',
        hospitalId: 'h1',
        actorUserId: 'u1',
        entityType: 'session',
        entityId: 's1',
        requestId: 'r1',
        ipAddress: '10.0.0.1',
        metadata: { reason: 'login' },
      },
      undefined,
    );
  });

  it('passes the caller transaction through', async () => {
    const { service, insert } = setup();
    const tx = {} as never;
    await service.record({ action: 'auth.session.ended', hospitalId: null, actorUserId: null }, tx);
    expect(insert.mock.calls[0]?.[1]).toBe(tx);
  });

  it('rejects actions that do not follow module.resource.verb', async () => {
    const { service, insert } = setup();
    await expect(service.record({ action: 'login', hospitalId: null, actorUserId: null })).rejects.toThrow('module.resource.verb');
    expect(insert).not.toHaveBeenCalled();
  });
});
