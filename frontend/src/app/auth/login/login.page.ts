import { Component, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonButton, IonInput, IonItem,
  IonLabel, IonSpinner, IonText,
} from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    IonContent, IonButton, IonInput, IonItem,
    IonLabel, IonSpinner, IonText,
  ],
  templateUrl: './login.page.html',
})
export class LoginPage {
  loading  = signal(false);
  errorMsg = signal('');

  form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor(private fb: FormBuilder, private auth: AuthService) {}

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      await this.auth.signIn(
        this.form.value.email!,
        this.form.value.password!,
      );
    } catch (err: any) {
      // Mostrar el error real de Supabase para diagnosticar
      const msg = err?.message ?? JSON.stringify(err);
      console.error('[Login error]', msg);
      this.errorMsg.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}