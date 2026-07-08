import { Component, OnInit, computed, signal } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonCard, IonCardContent, IonSpinner, IonBadge, IonIcon, IonRefresher, IonRefresherContent,
  IonButtons, IonBackButton,
} from '@ionic/angular/standalone';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline, closeCircleOutline,
  timeOutline, hardwareChipOutline, chevronBackOutline,
} from 'ionicons/icons';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/services/supabase';

interface ScraperStatus {
  scraper: string;
  kind: 'bank' | 'super';
  ok: boolean;
  items_count: number;
  error: string | null;
  duration_ms: number;
  ran_at: string;
  stale: boolean;
}

interface MonitorStatus {
  healthy: boolean;
  total: number;
  brokenCount: number;
  scrapers: ScraperStatus[];
}

@Component({
  selector: 'app-monitor',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonCard, IonCardContent, IonSpinner, IonBadge, IonIcon, IonRefresher, IonRefresherContent,
    IonButtons, IonBackButton,
  ],
  templateUrl: './monitor.page.html',
})
export class MonitorPage implements OnInit {
  status  = signal<MonitorStatus | null>(null);
  loading = signal(false);
  error   = signal('');

  banks  = computed(() => this.status()?.scrapers.filter(s => s.kind === 'bank') ?? []);
  supers = computed(() => this.status()?.scrapers.filter(s => s.kind === 'super') ?? []);

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) {
    addIcons({ checkmarkCircleOutline, closeCircleOutline, timeOutline, hardwareChipOutline, chevronBackOutline });
  }

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const { data } = await this.supabase.client.auth.getSession();
      const headers = new HttpHeaders({
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      });
      const res = await firstValueFrom(
        this.http.get<MonitorStatus>(`${environment.apiUrl}/scraper-monitor/status`, { headers }),
      );
      this.status.set(res);
    } catch {
      this.error.set('No se pudo cargar el estado de los scrapers.');
    } finally {
      this.loading.set(false);
    }
  }

  async onRefresh(ev: any) {
    await this.load();
    ev.target.complete();
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  }
}
