import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Platform } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications, Token,
  PushNotificationSchema, ActionPerformed,
} from '@capacitor/push-notifications';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private inicializado = false;

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
    private readonly platform: Platform,
  ) {}

  /**
   * Nunca lanza: si falta la config de Firebase (google-services.json) o el
   * permiso, la app tiene que seguir abriendo igual, solo sin push.
   */
  async init() {
    if (this.inicializado) return;
    if (!this.platform.is('capacitor')) return;
    if (!Capacitor.isPluginAvailable('PushNotifications')) return;

    this.inicializado = true;

    try {
      // Listeners primero, así no se pierde el evento 'registration'
      await PushNotifications.addListener('registration', (token: Token) => {
        this.saveToken(token.value);
      });

      await PushNotifications.addListener('registrationError', err =>
        console.error('[FCM] Registration error:', err),
      );

      await PushNotifications.addListener('pushNotificationReceived', (n: PushNotificationSchema) =>
        console.log('[FCM] Received:', n),
      );

      await PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) =>
        console.log('[FCM] Action:', a),
      );

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      await PushNotifications.register();
    } catch (err) {
      // Típicamente: Firebase sin configurar en el build nativo
      console.warn('[FCM] Push deshabilitado:', err);
    }
  }

  private async saveToken(token: string) {
    try {
      const { data } = await this.supabase.client.auth.getSession();
      if (!data.session?.access_token) return;
      const headers = new HttpHeaders({
        Authorization: `Bearer ${data.session.access_token}`,
      });
      const platform = this.platform.is('ios') ? 'ios' : 'android';
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/notifications/token`, { token, platform }, { headers }),
      );
    } catch (err) {
      console.error('[FCM] Save token error:', err);
    }
  }
}
