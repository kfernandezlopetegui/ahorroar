import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  onModuleInit() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
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