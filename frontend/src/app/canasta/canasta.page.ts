import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner,
  IonCard, IonCardContent, IonSearchbar, IonSegment, IonSegmentButton,
  IonLabel, IonList, IonItem,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import {
  addOutline, removeOutline, trashOutline, basketOutline,
  trendingUpOutline, trendingDownOutline, chevronBackOutline,
  statsChartOutline, checkmarkCircleOutline, searchOutline,
} from 'ionicons/icons';
import { BasketService, BasketItem, ProductoBusqueda } from '../core/services/basket';

@Component({
  selector: 'app-canasta',
  standalone: true,
  imports: [
    DecimalPipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner,
    IonCard, IonCardContent, IonSearchbar, IonSegment, IonSegmentButton,
    IonLabel, IonList, IonItem,
  ],
  templateUrl: './canasta.page.html',
})
export class CanastaPage implements OnInit {
  meses          = signal(3);
  searchResults  = signal<ProductoBusqueda[]>([]);
  searching      = signal(false);
  searchQuery    = signal('');

  get items()       { return this.svc.items; }
  get loading()     { return this.svc.loading; }
  get loadingEval() { return this.svc.loadingEval; }
  get evaluation()  { return this.svc.evaluation; }

  constructor(
    public svc: BasketService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) {
    addIcons({
      addOutline, removeOutline, trashOutline, basketOutline,
      trendingUpOutline, trendingDownOutline, chevronBackOutline,
      statsChartOutline, checkmarkCircleOutline, searchOutline,
    });
  }

  async ngOnInit() {
    await this.svc.load();
    await this.svc.evaluate(this.meses());
  }

  async onSearch(ev: any) {
    const q = ev.detail.value ?? '';
    this.searchQuery.set(q);
    if (q.trim().length < 3) {
      this.searchResults.set([]);
      return;
    }
    this.searching.set(true);
    const res = await this.svc.searchProducts(q);
    // Descartar respuestas de búsquedas viejas
    if (this.searchQuery() === q) {
      this.searchResults.set(res.slice(0, 8));
      this.searching.set(false);
    }
  }

  async addProduct(p: ProductoBusqueda) {
    try {
      await this.svc.add(p.id, p.nombre);
      this.searchResults.set([]);
      this.searchQuery.set('');
      await this.svc.evaluate(this.meses());
      const t = await this.toastCtrl.create({
        message: 'Producto agregado a tu canasta',
        icon: 'checkmark-circle-outline',
        duration: 2000,
        color: 'success',
        position: 'top',
      });
      await t.present();
    } catch {
      const t = await this.toastCtrl.create({
        message: 'No se pudo agregar el producto.',
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      await t.present();
    }
  }

  async changeCantidad(item: BasketItem, delta: number) {
    const nueva = item.cantidad + delta;
    if (nueva < 1 || nueva > 99) return;
    await this.svc.setCantidad(item, nueva);
    await this.svc.evaluate(this.meses());
  }

  async confirmRemove(item: BasketItem) {
    const alert = await this.alertCtrl.create({
      header: 'Quitar de la canasta',
      message: `¿Sacás "${item.producto_nombre}" de tu canasta?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Quitar', role: 'destructive',
          handler: async () => {
            await this.svc.remove(item.id);
            await this.svc.evaluate(this.meses());
          },
        },
      ],
    });
    await alert.present();
  }

  async onMesesChange(ev: any) {
    const m = parseInt(ev.detail.value);
    this.meses.set(m);
    await this.svc.evaluate(m);
  }

  evalFor(itemId: string) {
    return this.evaluation()?.items.find(e => e.id === itemId) ?? null;
  }

  /** "2026-04" → "abr 2026" */
  periodoLabel(periodo: string | null): string {
    if (!periodo) return '—';
    const [y, m] = periodo.split('-').map(Number);
    const nombres = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
                     'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${nombres[m] ?? '?'} ${y}`;
  }
}
