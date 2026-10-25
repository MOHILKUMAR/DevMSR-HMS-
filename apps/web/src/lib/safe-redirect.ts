/**
 * Where to go after sign-in. Only a path on this site is accepted, so a crafted `?next=` link cannot
 * send staff to another site after they enter their password.
 */
export function safeRedirectPath(next: string | string[] | undefined): string {
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/login')) return '/';
  return next;
}
