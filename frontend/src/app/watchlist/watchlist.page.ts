import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonButton, IonIcon, IonSpinner,
  IonCard, IonCardContent, IonBadge,
  IonItem, IonLabel, IonRange,
  ToastController, AlertController,
} from '@ionic/angular/standalone';
import { DecimalPipe } from '@angular/common';
import { addIcons } from 'ionicons';
import {
  trashOutline, pricetagOutline, eyeOutline,
  trendingDownOutline, notificationsOutline,
} from 'ionicons/icons';
import { WatchlistService, WatchlistItem } from '../core/services/watchlist';

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [
    DecimalPipe, RouterLink,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon, IonSpinner,
    IonCard, IonCardContent, IonBadge,
    
  ],
  templateUrl: './watchlist.page.html',
})
export class WatchlistPage implements OnInit {
  get items()   { return this.svc.items; }
  get loading() { return this.svc.loading; }

  constructor(
    public svc: WatchlistService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) {
    addIcons({ trashOutline, pricetagOutline, eyeOutline, trendingDownOutline, notificationsOutline });
  }

  ngOnInit() { this.svc.load(); }

  async editThreshold(item: WatchlistItem) {
    const alert = await this.alertCtrl.create({
      header: 'Umbral de descuento',
      subHeader: item.producto_nombre,
      message: `Actual: ${item.discount_threshold}% — Te avisamos cuando baje ese % o más.`,
      inputs: [{
        name:  'threshold',
        type:  'number',
        value: item.discount_threshold,
        min:   5,
        max:   80,
        placeholder: '% de descuento (5–80)',
      }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (val) => {
            const pct = Math.min(80, Math.max(5, Number(val.threshold) || 10));
            await this.svc.upsertByThreshold(item.ean, item.producto_nombre, pct);
            const t = await this.toastCtrl.create({
              message: `Umbral actualizado a ${pct}% 🔔`,
              duration: 2000, color: 'success', position: 'top',
            });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmRemove(item: WatchlistItem) {
    const alert = await this.alertCtrl.create({
      header: 'Dejar de seguir',
      message: `¿Dejás de seguir "${item.producto_nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar', role: 'destructive',
          handler: async () => {
            await this.svc.remove(item.id);
            const t = await this.toastCtrl.create({
              message: 'Eliminado de watchlist', duration: 2000,
            });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }
}