// src/app/core/guards/auth-guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Esperar a que Supabase resuelva la sesión
  await auth.waitForSession();

  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/auth/login']);
};