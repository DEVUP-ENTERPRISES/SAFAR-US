/**
 * The console's public base path. Must match backend `ADMIN_SLUG` — the
 * middleware rewrites `/{slug}/*` onto the real `app/admin/*` routes.
 */
export const ADMIN_SLUG = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';

/**
 * Build a console URL. Always use this instead of writing `/admin/...`, or the
 * link will 404 once the secret slug is set.
 *
 *   adminPath()            -> /your-secret-admin-path
 *   adminPath('users')     -> /your-secret-admin-path/users
 *   adminPath('/hosts?x=1')-> /your-secret-admin-path/hosts?x=1
 */
export function adminPath(sub = ''): string {
  const clean = sub.replace(/^\/+/, '');
  return clean ? `/${ADMIN_SLUG}/${clean}` : `/${ADMIN_SLUG}`;
}
