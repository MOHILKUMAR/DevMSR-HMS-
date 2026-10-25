import type { UserKind } from '../generated/prisma/client.js';

/** A super admin's read-only access to one hospital, for this session, until it expires. */
export interface BreakGlassAccess {
  grantId: string;
  hospitalId: string;
  expiresAt: Date;
}

/** Who is making the request. Set by the session guard, read by guards, services and audit. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  /**
   * The hospital whose data this request may reach. The user's own hospital, or during break-glass
   * the hospital opened. Null only for platform users without break-glass, who reach no hospital data.
   */
  hospitalId: string | null;
  /** The user's own hospital (null for platform users), for their own account, sessions and notifications. */
  userHospitalId: string | null;
  kind: UserKind;
  permissions: ReadonlySet<string>;
  expiresAt: Date;
  breakGlass: BreakGlassAccess | null;
}
