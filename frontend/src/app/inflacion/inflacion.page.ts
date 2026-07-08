import { Component, OnInit, computed, signal } from '@angular/core';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonCard, IonCardContent, IonSpinner, IonSegment, IonSegmentButton, IonLabel, IonIcon,
  IonButtons, IonBackButton,
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import { trendingUpOutline, trendingDownOutline, statsChartOutline, chevronBackOutline } from 'ionicons/icons';
import { InflationService, MonthPoint } from '../core/services/inflation';

interface ChartLine {
  label: string;
  color: string;
  path: string;
  points: { x: number; y: number; point: MonthPoint }[];
}

const W = 320;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

@Component({
  selector: 'app-inflacion',
  standalone: true,
  imports: [
    DecimalPipe,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonCard, IonCardContent, IonSpinner, IonSegment, IonSegmentButton, IonLabel, IonIcon,
    IonButtons, IonBackButton,
  ],
  templateUrl: './inflacion.page.html',
})
export class InflacionPage implements OnInit {
  meses = signal(6);
  readonly chartW = W;
  readonly chartH = H;

  get data()    { return this.svc.data; }
  get loading() { return this.svc.loading; }
  get error()   { return this.svc.error; }

  /** Variación acumulada de la canasta en el período */
  acumuladoCanasta = computed(() => this.acumulado(this.data()?.canasta.puntos ?? []));
  acumuladoIpc     = computed(() => this.acumulado(this.data()?.ipc ?? []));

  lines = computed<ChartLine[]>(() => {
    const d = this.data();
    if (!d) return [];

    const series = [
      { label: 'Tu canasta', color: '#C65D4A', puntos: d.canasta.puntos },
      { label: 'IPC (INDEC)', color: '#9CAF88', puntos: d.ipc },
    ].filter(s => s.puntos.length >= 2);

    if (!series.length) return [];

    const all = series.flatMap(s => s.puntos);
    const periodos = [...new Set(all.map(p => p.periodo))].sort();
    const minI = Math.min(...all.map(p => p.indice), 100);
    const maxI = Math.max(...all.map(p => p.indice), 100);
    const range = maxI - minI || 1;

    const x = (periodo: string) =>
      PAD.left + (periodos.indexOf(periodo) / Math.max(periodos.length - 1, 1)) * (W - PAD.left - PAD.right);
    const y = (indice: number) =>
      PAD.top + (1 - (indice - minI) / range) * (H - PAD.top - PAD.bottom);

    return series.map(s => {
      const pts = s.puntos.map(p => ({ x: x(p.periodo), y: y(p.indice), point: p }));
      return {
        label: s.label,
        color: s.color,
        points: pts,
        path: pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      };
    });
  });

  periodos = computed(() => {
    const d = this.data();
    if (!d) return [];
    const all = [...(d.canasta.puntos ?? []), ...(d.ipc ?? [])];
    return [...new Set(all.map(p => p.periodo))].sort();
  });

  constructor(public svc: InflationService) {
    addIcons({ trendingUpOutline, trendingDownOutline, statsChartOutline, chevronBackOutline });
  }

  ngOnInit() {
    this.svc.load(this.meses());
  }

  onMesesChange(ev: any) {
    const meses = parseInt(ev.detail.value);
    this.meses.set(meses);
    this.svc.load(meses);
  }

  private acumulado(puntos: MonthPoint[]): number | null {
    if (puntos.length < 1) return null;
    const ultimo = puntos[puntos.length - 1];
    return Math.round((ultimo.indice - 100) * 100) / 100;
  }
}
