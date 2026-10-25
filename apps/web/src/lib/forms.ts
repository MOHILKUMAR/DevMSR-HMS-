import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * Connects a Zod schema from @devmsr/validation to React Hook Form, so the screen checks input with
 * the same rules as the API. Only the failing field paths are kept: screens show their own messages
 * from messages/en.json, never Zod's English.
 */
export function zodResolver<T extends FieldValues>(schema: ZodType<T>): Resolver<T> {
  return (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      errors[path] ??= { type: issue.code, message: '' };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
