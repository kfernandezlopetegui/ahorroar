import { Component, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonButton, IonInput, IonItem,
  IonLabel, IonSpinner, IonText,
} from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirm  = control.get('confirmPassword')?.value;
  return password === confirm ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    IonContent, IonButton, IonInput, IonItem,
    IonLabel, IonSpinner, IonText,
  ],
  templateUrl: './register.page.html',
})
export class RegisterPage {
  loading  = signal(false);
  errorMsg = signal('');
  success  = signal(false);

  form = this.fb.group(
    {
      email:           ['', [Validators.required, Validators.email]],
      password:        ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor(private fb: FormBuilder, private auth: AuthService) {}

  get passwordMismatch() {
    return this.form.errors?.['passwordsMismatch'] && this.form.get('confirmPassword')?.dirty;
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      await this.auth.signUp(
        this.form.value.email!,
        this.form.value.password!,
      );
      this.success.set(true);
    } catch (err: any) {
      const msg = err?.message ?? 'No se pudo crear la cuenta.';
      // Traducir errores comunes de Supabase
      if (msg.includes('already registered')) {
        this.errorMsg.set('Este email ya está registrado.');
      } else if (msg.includes('Password should be')) {
        this.errorMsg.set('La contraseña debe tener al menos 6 caracteres.');
      } else {
        this.errorMsg.set(msg);
      }
    } finally {
      this.loading.set(false);
    }
  }
}