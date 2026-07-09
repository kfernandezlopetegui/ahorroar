import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';

/**
 * Restringe el endpoint a administradores. Un usuario es admin si:
 *  - su email figura en la env ADMIN_EMAILS (lista separada por comas), o
 *  - tiene role 'admin' en el app_metadata de Supabase Auth.
 * Usar siempre después de JwtGuard (necesita req.user).
 */
export function isAdminUser(user: any): boolean {
  if (!user) return false;
  if (user.app_metadata?.role === 'admin') return true;

  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return !!user.email && admins.includes(user.email.toLowerCase());
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!isAdminUser(req.user)) {
      throw new ForbiddenException('Solo disponible para administradores');
    }
    return true;
  }
}
