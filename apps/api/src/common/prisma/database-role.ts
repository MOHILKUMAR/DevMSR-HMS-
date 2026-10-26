/**
 * The database role a connection string signs in as. Supabase's pooler (Supavisor) needs the project
 * written after the role, as `hms_app.<project-ref>`, while the role itself is `hms_app`. Role names
 * here never contain a dot, so whatever follows the first dot is the pooler's routing, not the name.
 */
export function roleOf(username: string): string {
  const decoded = decodeURIComponent(username);
  const dot = decoded.indexOf('.');
  return dot === -1 ? decoded : decoded.slice(0, dot);
}
