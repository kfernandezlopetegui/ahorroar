import { Component, OnDestroy, signal } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonCard, IonCardContent, IonSpinner, IonIcon, IonButton,
  IonRefresher, IonRefresherContent, IonModal, IonList, IonItem,
  ViewWillEnter, ViewWillLeave, ToastController,
} from '@ionic/angular/standalone';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline, closeCircleOutline, timeOutline, playOutline,
  chevronBackOutline, businessOutline, cartOutline, ellipseOutline,
  refreshOutline, alertCircleOutline, chevronForwardOutline, chevronDownOutline,
} from 'ionicons/icons';
import {
  ScraperMonitorService, MonitorStatus, ScraperStatus, ScraperRun,
} from '../../core/services/scraper-monitor';

@Component({
  selector: 'app-scraper-monitor',
  standalone: true,
  imports: [
    NgClass, NgTemplateOutlet,
    IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonSpinner, IonIcon, IonButton,
    IonRefresher, IonRefresherContent, IonModal, IonList, IonItem,
  ],
  templateUrl: './scraper-monitor.page.html',
})
export class ScraperMonitorPage implements ViewWillEnter, ViewWillLeave, OnDestroy {
  status = signal<MonitorStatus | null>(null);
  loading = signal(false);
  error = signal('');
  running = signal<Set<string>>(new Set()); // scrapers con "Ejecutar ahora" en curso

  // Detalle / historial
  selected = signal<ScraperStatus | null>(null);
  runs = signal<ScraperRun[]>([]);
  runsLoading = signal(false);
  expandedRun = signal<string | null>(null);

  private timer: any = null;
  private readonly AUTO_REFRESH_MS = 30_000;

  constructor(
    private readonly svc: ScraperMonitorService,
    private readonly toast: ToastController,
  ) {
    addIcons({
      checkmarkCircleOutline, closeCircleOutline, timeOutline, playOutline,
      chevronBackOutline, businessOutline, cartOutline, ellipseOutline,
      refreshOutline, alertCircleOutline, chevronForwardOutline, chevronDownOutline,
    });
  }

  ionViewWillEnter() {
    this.load();
    this.timer = setInterval(() => this.load(true), this.AUTO_REFRESH_MS);
  }

  ionViewWillLeave() {
    this.stopTimer();
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  banks() {
    return this.status()?.scrapers.filter((s) => s.type === 'bank') ?? [];
  }
  supers() {
    return this.status()?.scrapers.filter((s) => s.type === 'supermarket') ?? [];
  }

  async load(silent = false) {
    if (!silent) this.loading.set(true);
    this.error.set('');
    try {
      this.status.set(await this.svc.getStatus());
    } catch {
      if (!silent) this.error.set('No se pudo cargar el estado de los scrapers.');
    } finally {
      this.loading.set(false);
    }
  }

  async onRefresh(ev: any) {
    await this.load();
    ev.target.complete();
  }

  async runNow(scraper: ScraperStatus, ev?: Event) {
    ev?.stopPropagation();
    const next = new Set(this.running());
    next.add(scraper.name);
    this.running.set(next);
    try {
      await this.svc.runNow(scraper.name);
      await this.showToast(`Corrida de ${scraper.label} encolada`, 'success');
      // Refrescamos en breve para reflejar el estado "running".
      setTimeout(() => this.load(true), 1500);
    } catch {
      await this.showToast(`No se pudo encolar ${scraper.label}`, 'danger');
    } finally {
      const done = new Set(this.running());
      done.delete(scraper.name);
      this.running.set(done);
    }
  }

  isRunning(name: string) {
    return this.running().has(name);
  }

  async openDetail(scraper: ScraperStatus) {
    this.selected.set(scraper);
    this.expandedRun.set(null);
    this.runs.set([]);
    this.runsLoading.set(true);
    try {
      const res = await this.svc.getRuns(scraper.name, 20);
      this.runs.set(res.runs);
    } catch {
      await this.showToast('No se pudo cargar el historial', 'danger');
    } finally {
      this.runsLoading.set(false);
    }
  }

  closeDetail() {
    this.selected.set(null);
  }

  toggleRun(run: ScraperRun) {
    if (!run.error_message) return;
    this.expandedRun.set(this.expandedRun() === run.id ? null : run.id);
  }

  // ── Helpers de presentación ────────────────────────────────────────────────

  healthTitle(st: MonitorStatus): string {
    if (!st.queue?.connected) return 'Cola de scrapers sin conexión';
    if (st.totals.error > 0) return `${st.totals.error} con problemas`;
    return 'Todos los scrapers OK';
  }

  /**
   * Diagnóstico de conectividad: distingue "el backend no llega a Redis"
   * (no se puede encolar nada) de "hay jobs encolados pero el worker no
   * los consume" (worker caído o sin las mismas credenciales de Redis).
   */
  queueWarning(st: MonitorStatus): { title: string; detail: string } | null {
    const q = st.queue;
    if (!q) return null;
    if (!q.connected) {
      return {
        title: 'Redis desconectado',
        detail:
          'El backend no llega a la cola de scrapers: no se pueden encolar ni ' +
          'procesar corridas. Revisá las variables REDIS_* del backend.' +
          (q.error ? ` (${q.error})` : ''),
      };
    }
    if (q.counts && q.counts.waiting > 0 && q.counts.active === 0) {
      return {
        title: 'El worker no está consumiendo la cola',
        detail:
          `Hay ${q.counts.waiting} corridas esperando y ninguna activa. ` +
          'El worker de scrapers parece caído o apunta a otra instancia de Redis.',
      };
    }
    return null;
  }

  chipClass(status: string): string {
    switch (status) {
      case 'success': return 'chip chip--ok';
      case 'partial': return 'chip chip--partial';
      case 'error': return 'chip chip--error';
      case 'running': return 'chip chip--running';
      default: return 'chip chip--never';
    }
  }

  chipLabel(status: string): string {
    switch (status) {
      case 'success': return 'OK';
      case 'partial': return 'Parcial';
      case 'error': return 'Error';
      case 'running': return 'Corriendo';
      default: return 'Nunca corrió';
    }
  }

  timeAgo(dateStr: string | null | undefined): string {
    if (!dateStr) return 'nunca';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'recién';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    return `hace ${Math.floor(hrs / 24)} d`;
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const t = await this.toast.create({ message, color, duration: 2200, position: 'bottom' });
    await t.present();
  }
}
