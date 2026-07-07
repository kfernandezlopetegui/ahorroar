import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmReady = false;

  constructor(private readonly supabase: SupabaseService) {}

  onModuleInit() {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
      process.env;

    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      this.logger.warn(
        'Credenciales de Firebase incompletas: los push quedan deshabilitados, el resto de la API sigue funcionando.',
      );
      return;
    }

    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      }
      this.fcmReady = true;
    } catch (err: any) {
      this.logger.error(`No se pudo inicializar Firebase Admin: ${err.message}`);
    }
  }

  async saveToken(userId: string, token: string, platform?: string) {
    const { error } = await this.supabase.client
      .from('fcm_tokens')
      .upsert({ user_id: userId, token, platform }, { onConflict: 'user_id,token' });
    if (error) throw error;
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.fcmReady) {
      this.logger.warn('FCM no inicializado: se omite el envío de push.');
      return;
    }

    const { data: tokens } = await this.supabase.client
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', userId);

    if (!tokens?.length) return;

    for (const { token } of tokens) {
      try {
        await admin.messaging().send({
          token,
          notification: { title, body },
          data: data ?? {},
          android: { priority: 'high' },
          apns: { payload: { aps: { alert: { title, body }, sound: 'default' } } },
        });
      } catch (err: any) {
        this.logger.error(`FCM send failed for token ${token}:`, err.message);
        if (err?.errorInfo?.code === 'messaging/registration-token-not-registered') {
          await this.supabase.client.from('fcm_tokens').delete().eq('token', token);
        }
      }
    }
  }

  async sendMulticast(tokens: string[], title: string, body: string) {
    if (!this.fcmReady) {
      this.logger.warn('FCM no inicializado: se omite el envío de push.');
      return;
    }
    if (!tokens.length) return;
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

    for (const chunk of chunks) {
      await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
      });
    }
  }
}