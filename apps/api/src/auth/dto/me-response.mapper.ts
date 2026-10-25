import type { MeResponse } from '@devmsr/validation';
import type { UserProfile } from '../auth.repository.js';
import { SESSION_IDLE_TIMEOUT_MS } from '../sessions.service.js';

export function toMeResponse(user: UserProfile, permissions: readonly string[], expiresAt: Date): MeResponse {
  return {
    user: { id: user.id, username: user.username, displayName: user.displayName, kind: user.kind },
    hospital: user.hospital === null ? null : { id: user.hospital.id, code: user.hospital.code, name: user.hospital.name },
    permissions: [...permissions].sort(),
    session: { expiresAt: expiresAt.toISOString(), idleTimeoutSeconds: SESSION_IDLE_TIMEOUT_MS / 1000 },
  };
}
