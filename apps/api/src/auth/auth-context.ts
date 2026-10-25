import type { UserKind } from '../generated/prisma/client.js';

/** Who is making the request. Set by the session guard, read by guards, services and audit. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  /** Null only for platform users, who cannot reach hospital data. */
  hospitalId: string | null;
  kind: UserKind;
  permissions: ReadonlySet<string>;
  expiresAt: Date;
}
