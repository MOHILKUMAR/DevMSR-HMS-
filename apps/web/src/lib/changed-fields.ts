/**
 * A PATCH body with only the fields that differ from the record, or null when nothing changed.
 * Optional text compares as null when empty, the way the API stores it.
 */
export function changedFields<T extends Record<string, unknown>>(before: Partial<Record<keyof T, unknown>>, after: T): Partial<T> | null {
  const changes: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const next = after[key] === '' ? null : after[key];
    const previous = before[key] === '' ? null : before[key];
    if (next !== undefined && next !== previous) changes[key] = after[key];
  }
  return Object.keys(changes).length === 0 ? null : changes;
}
