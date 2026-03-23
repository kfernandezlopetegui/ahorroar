import {
  Component, Input, OnChanges, SimpleChanges,
  ElementRef, ViewChild, AfterViewInit, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PCHistorialRow } from '../../core/services/precios-claros';
import { IonSpinner } from '@ionic/angular/standalone';

interface ChartPoint { date: string; precio: number; cadena: string }

@Component({
  selector: 'app-price-chart',
  standalone: true,
  imports: [CommonModule, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './price-chart.component.html',
  styleUrls: ['./price-chart.component.scss'],
})
export class PriceChartComponent implements OnChanges, AfterViewInit {
  @Input() rows: PCHistorialRow[] = [];
  @Input() loading = false;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  series: { cadena: string; color: string; points: ChartPoint[] }[] = [];

  private readonly COLORS = [
    '#3880ff', '#2dd36f', '#eb445a', '#ffc409',
    '#92949c', '#7044ff', '#0cd1e8',
  ];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['rows']) this.buildSeries();
  }

  ngAfterViewInit() {
    this.draw();
  }

  private buildSeries() {
    const map = new Map<string, ChartPoint[]>();
    for (const r of this.rows) {
      const day = r.captured_at.slice(0, 10);
      if (!map.has(r.cadena)) map.set(r.cadena, []);
      const existing = map.get(r.cadena)!.find((p: ChartPoint) => p.date === day);
      if (!existing) {
        map.get(r.cadena)!.push({ date: day, precio: r.precio_lista, cadena: r.cadena });
      }
    }

    let i = 0;
    this.series = Array.from(map.entries()).map(([cadena, points]) => ({
      cadena,
      color: this.COLORS[i++ % this.COLORS.length],
      points: points.sort((a: ChartPoint, b: ChartPoint) => a.date.localeCompare(b.date)),
    }));

    setTimeout(() => this.draw(), 0);
  }

  private draw() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.series.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.offsetHeight * devicePixelRatio;
    canvas.width = W;
    canvas.height = H;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const pad = { top: 16, right: 16, bottom: 36, left: 56 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Rango de datos — sin flatMap
    const allPrices: number[] = [];
    const allDatesSet = new Set<string>();
    for (const s of this.series) {
      for (const p of s.points) {
        allPrices.push(p.precio);
        allDatesSet.add(p.date);
      }
    }
    const allDates = Array.from(allDatesSet).sort();

    if (!allPrices.length || !allDates.length) return;

    const minP = Math.min(...allPrices) * 0.97;
    const maxP = Math.max(...allPrices) * 1.03;

    const xScale = (date: string): number => {
      const idx = allDates.indexOf(date);
      return pad.left + (idx / Math.max(allDates.length - 1, 1)) * plotW;
    };
    const yScale = (p: number): number =>
      pad.top + plotH - ((p - minP) / (maxP - minP)) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = 1;
    for (let gi = 0; gi <= 4; gi++) {
      const y = pad.top + (plotH / 4) * gi;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
      const label = Math.round(maxP - ((maxP - minP) / 4) * gi);
      ctx.fillStyle = 'rgba(128,128,128,0.8)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`$${label.toLocaleString('es-AR')}`, pad.left - 6, y + 4);
    }

    // Eje X — fechas
    const step = Math.max(1, Math.floor(allDates.length / 5));
    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.textAlign = 'center';
    ctx.font = '10px sans-serif';
    allDates.forEach((d: string, idx: number) => {
      if (idx % step === 0) {
        const x = xScale(d);
        const parts = d.split('-');
        ctx.fillText(`${parts[2]}/${parts[1]}`, x, h - pad.bottom + 16);
      }
    });

    // Líneas por cadena
    for (const serie of this.series) {
      if (serie.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = serie.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      serie.points.forEach((pt: ChartPoint, idx: number) => {
        const x = xScale(pt.date);
        const y = yScale(pt.precio);
        idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      for (const pt of serie.points) {
        ctx.beginPath();
        ctx.arc(xScale(pt.date), yScale(pt.precio), 3, 0, Math.PI * 2);
        ctx.fillStyle = serie.color;
        ctx.fill();
      }
    }
  }
}