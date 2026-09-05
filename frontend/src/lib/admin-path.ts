/**
 * The console's public base path. Must match backend `ADMIN_SLUG` — the
 * middleware rewrites `/{slug}/*` onto the real `app/admin/*` routes.
 */
export const ADMIN_SLUG = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';

/**
 * Build a console URL. Always use this instead of writing `/admin/...`, or the
 * link will 404 once the secret slug is set.
 *
 *   adminPath()            -> /ctrl-0986-cato-admin
 *   adminPath('users')     -> /ctrl-0986-cato-admin/users
 *   adminPath('/hosts?x=1')-> /ctrl-0986-cato-admin/hosts?x=1
 */
export function adminPath(sub = ''): string {
  const clean = sub.replace(/^\/+/, '');
  // In the standalone admin app (port 3005) the console IS the whole site, so
  // routes live at the root — `/users`, not `/{slug}/users`. The public app
  // leaves this unset and keeps serving the console behind its secret slug.
  if (process.env.NEXT_PUBLIC_ADMIN_ROOT === '1') {
    return clean ? `/${clean}` : '/';
  }
  return clean ? `/${ADMIN_SLUG}/${clean}` : `/${ADMIN_SLUG}`;
}
