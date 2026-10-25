import type { MeResponse } from '@devmsr/validation';
import type { BreakGlassAccess } from '../auth-context.js';
import type { UserProfile } from '../auth.repository.js';
import { SESSION_IDLE_TIMEOUT_MS } from '../sessions.service.js';

/** `hospital` is the user's own, or during break-glass the hospital opened. */
export function toMeResponse(
  user: UserProfile,
  permissions: readonly string[],
  expiresAt: Date,
  breakGlass: { access: BreakGlassAccess; hospital: { id: string; code: string; name: string } } | null = null,
): MeResponse {
  const hospital = breakGlass?.hospital ?? user.hospital;
  return {
    user: { id: user.id, username: user.username, displayName: user.displayName, kind: user.kind },
    hospital: hospital === null ? null : { id: hospital.id, code: hospital.code, name: hospital.name },
    permissions: [...permissions].sort(),
    session: { expiresAt: expiresAt.toISOString(), idleTimeoutSeconds: SESSION_IDLE_TIMEOUT_MS / 1000 },
    breakGlass: breakGlass === null ? null : { grantId: breakGlass.access.grantId, expiresAt: breakGlass.access.expiresAt.toISOString() },
  };
}
