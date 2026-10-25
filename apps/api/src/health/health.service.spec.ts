import { describe, expect, it, vi } from 'vitest';
import type { HealthRepository } from './health.repository.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    expect(await new HealthService({ ping } as unknown as HealthRepository).check()).toEqual({ status: 'ok' });
    expect(ping).toHaveBeenCalledOnce();
  });

  it('fails when the database does not answer', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('connection refused'));
    await expect(new HealthService({ ping } as unknown as HealthRepository).check()).rejects.toThrow();
  });
});
