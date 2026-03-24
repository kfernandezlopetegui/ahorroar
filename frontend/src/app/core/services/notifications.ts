import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Platform } from '@ionic/angular/standalone';
import {
  PushNotifications, Token,
  PushNotificationSchema, ActionPerformed,
} from '@capacitor/push-notifications';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
    private readonly platform: Platform,
  ) {}

  async init() {
    if (!this.platform.is('capacitor')) return;

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', (token: Token) => {
      this.saveToken(token.value);
    });

    PushNotifications.addListener('registrationError', err =>
      console.error('[FCM] Registration error:', err),
    );

    PushNotifications.addListener('pushNotificationReceived', (n: PushNotificationSchema) =>
      console.log('[FCM] Received:', n),
    );

    PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) =>
      console.log('[FCM] Action:', a),
    );
  }

  private async saveToken(token: string) {
    try {
      const { data } = await this.supabase.client.auth.getSession();
      const headers = new HttpHeaders({
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
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