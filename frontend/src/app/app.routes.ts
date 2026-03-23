import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'tabs/home',
    pathMatch: 'full',
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./auth/login/login.page').then(m => m.LoginPage),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./auth/register/register.page').then(m => m.RegisterPage),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: () => import('./tabs/tabs.page').then(m => m.TabsPage),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./home/home.page').then(m => m.HomePage),
      },
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.page').then(m => m.ProfilePage),
      },
      {
        path: 'coupons',
        loadComponent: () => import('./coupons/coupons.page').then(m => m.CouponsPage),
      },
      {
        path: 'comparador',
        loadComponent: () => import('./comparador/comparador.page').then(m => m.ComparadorPage),
      },
      {
        path: 'lista',
        loadComponent: () => import('./lista/lista.page').then(m => m.ListaPage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'tabs/home',
  },
  


];