// src/app/core/services/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<User | null>(null);
  isLoading = signal(true);

  private sessionPromise: Promise<void>;

  constructor(private supabase: SupabaseService, private router: Router) {
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
    this.router.navigate(['/auth/login']);
  }

  isAuthenticated(): boolean {
    return !!this.currentUser();
  }
}