// src/app/core/guards/admin-guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

/** Solo administradores (según el backend). Los demás vuelven al perfil. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForSession();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);

  const isAdmin = await auth.checkAdmin();
  if (isAdmin) return true;
  return router.createUrlTree(['/tabs/profile']);
};
