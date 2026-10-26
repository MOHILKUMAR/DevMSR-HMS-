import { describe, expect, it } from 'vitest';
import { roleOf } from './database-role.js';

describe('roleOf', () => {
  it('reads the role from a Supabase pooler user name, and leaves a plain one alone', () => {
    expect(roleOf('hms_app.abcdefghijklmnop')).toBe('hms_app');
    expect(roleOf('postgres.abcdefghijklmnop')).toBe('postgres');
    expect(roleOf('hms_jobs')).toBe('hms_jobs');
    expect(roleOf('hms%5Fapp.ref')).toBe('hms_app');
  });
});
