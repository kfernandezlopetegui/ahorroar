// src/app/core/services/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<User | null>(null);
  isLoading = signal(true);
  /** true si el backend reconoce al usuario como administrador */
  isAdmin = signal(false);

  private sessionPromise: Promise<void>;
  private adminChecked = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private http: HttpClient,
  ) {
    // Guardar la promesa para que el guard pueda esperarla
    this.sessionPromise = this.supabase.getSession().then(({ data }) => {
      this.currentUser.set(data.session?.user ?? null);
      this.isLoading.set(false);
    });

    // Escuchar cambios posteriores (login, logout)
    this.supabase.onAuthStateChange((user) => {
      this.currentUser.set(user);
      this.isLoading.set(false);
    });
  }

  waitForSession(): Promise<void> {
    return this.sessionPromise;
  }

  /** Consulta (una sola vez por sesión) si el usuario es admin */
  async checkAdmin(): Promise<boolean> {
    if (this.adminChecked) return this.isAdmin();
    try {
      const { data } = await this.supabase.getSession();
      const token = data.session?.access_token;
      if (!token) return false;
      const res = await firstValueFrom(
        this.http.get<{ isAdmin: boolean }>(`${environment.apiUrl}/auth/me`, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
        }),
      );
      this.isAdmin.set(!!res.isAdmin);
      this.adminChecked = true;
    } catch {
      this.isAdmin.set(false);
    }
    return this.isAdmin();
  }

  async signUp(email: string, password: string) {
    const { error } = await this.supabase.signUp(email, password);
    if (error) throw error;
  }

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.signIn(email, password);
    if (error) throw error;
    this.router.navigate(['/tabs/home']);
  }

  async signOut() {
    await this.supabase.signOut();
    this.isAdmin.set(false);
    this.adminChecked = false;
    this.router.navigate(['/auth/login']);
  }

  isAuthenticated(): boolean {
    return !!this.currentUser();
  }
}