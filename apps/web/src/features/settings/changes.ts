import type { StaffUser, UpdateStaffUser } from '@devmsr/validation';

export interface EditUserValues {
  displayName: string;
  /** Left out when an admin edits themself: the API refuses changes to their own roles or status. */
  roleCodes?: string[] | undefined;
  isActive?: boolean | undefined;
}

function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((code, i) => code === right[i]);
}

/** Only the fields that changed, or null when nothing did. */
export function staffUserChanges(user: StaffUser, values: EditUserValues): UpdateStaffUser | null {
  const changes: UpdateStaffUser = {};
  if (values.displayName.trim() !== user.displayName) changes.displayName = values.displayName.trim();
  if (values.isActive !== undefined && values.isActive !== user.isActive) changes.isActive = values.isActive;
  if (values.roleCodes !== undefined && !sameCodes(values.roleCodes, user.roles.map((role) => role.code))) {
    changes.roleCodes = values.roleCodes;
  }
  return Object.keys(changes).length === 0 ? null : changes;
}

// Shared with other edit screens; kept exported here for the settings screens that use it.
export { changedFields } from '@/lib/changed-fields';
