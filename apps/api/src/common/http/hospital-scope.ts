import type { AuthContext } from '../../auth/auth-context.js';
import { Errors } from '../errors/app-error.js';

/**
 * The hospital every query of this request is limited to. Platform users have none, so hospital
 * routes refuse them even if a permission were granted by mistake.
 */
export function hospitalOf(auth: AuthContext): string {
  if (auth.hospitalId === null) {
    throw Errors.permissionDenied();
  }
  return auth.hospitalId;
}
